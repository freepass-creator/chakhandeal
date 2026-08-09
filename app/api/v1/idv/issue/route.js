import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { issueIdentityToken } from "@/lib/server/identityToken";
import { makeMatchKey } from "@/lib/server/matchKey";
import { DEMO_USER_IDS } from "@/lib/server/ids";
import { DEMO_USERS } from "@/lib/demo";
import { DEMO_MODE } from "@/lib/constants";
import { cleanBirth } from "@/lib/format";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { auditAccessDeny } from "@/lib/server/authz";
import { getContractInstance, attachSubject } from "@/lib/server/contractInstances";
import { writeAudit } from "@/lib/server/audit";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

/** 데모 샘플 인물 → 시드 userId. 비샘플이면 "" 반환(발급 거부). */
function resolveDemoUserId({ name, birth }) {
  const n = String(name || "").trim();
  const b = cleanBirth(birth);
  for (const [key, u] of Object.entries(DEMO_USERS)) {
    if (u.name === n && cleanBirth(u.birth) === b) {
      return u.userId || DEMO_USER_IDS[key] || "";
    }
  }
  return "";
}

/**
 * POST /api/v1/idv/issue — 본인확인 토큰 발급.
 *
 * ── 이 토큰이 뜻하는 것 (2026-08-09 사장님 확정) ──────────────────────
 * **「본인확인 완료」가 아니라 「신분증·얼굴을 제출했다」**이다.
 * 착한거래는 사진을 받아 보관만 하고, 대조 판정은 **담당자가 콘솔에서** 한다
 * (`identity.staffVerifiedAt`). 그러므로 이 토큰은 «이 계약의 손님 경로를 쓸 자격»일 뿐
 * 신원 보증이 아니다. 증명서에도 `identityVerifiedByStaff: false` 로 나간다.
 *
 * ── 두 가지 경로 ─────────────────────────────────────────────────
 * ① 계약 링크로 들어온 경우(`contractId` 있음) — **운영에서도 열린다.**
 *    발급 조건은 «그 계약의 서명자와 이름·생년이 일치»할 때뿐이다.
 *    계약 밖에서는 못 받으므로, 임의 name+birth 로 토큰을 받아 남의 이력을
 *    조회하는 존재여부 오라클(I2·I3)이 만들어지지 않는다.
 *    contractId 자체가 추측 불가한 비밀이라 이것이 1차 관문이 된다.
 *
 * ② 계약 없이(플랫폼 동의·증명 동선) — 데모에서만, 샘플 인물만.
 *    운영에서는 501. 여기를 열면 오라클이 생긴다.
 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`idv-issue:${ip}`, { limit: 40, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const name = String(body?.name || "").trim();
  const birth = cleanBirth(body?.birth);
  const phone = String(body?.phone || "").trim();
  const method = String(body?.method || "unknown");
  const contractId = String(body?.contractId || "").trim();
  if (!name || birth.length !== 6) {
    return NextResponse.json({ ok: false, error: "name·birth 필요" }, { status: 400 });
  }

  /* ── ① 계약에 묶인 발급 ───────────────────────────────── */
  if (contractId) {
    const inst = await getContractInstance(contractId);
    if (!inst) {
      await auditAccessDeny({ actor: ip, endpoint: "/api/v1/idv/issue", reason: "contract_not_found" });
      return NextResponse.json({ ok: false, error: "계약을 찾을 수 없습니다." }, { status: 404 });
    }
    if (inst.status === "signed") {
      return NextResponse.json({ ok: false, error: "이미 서명된 계약입니다.", code: "ALREADY_SIGNED" }, { status: 409 });
    }

    // 계약서에 적힌 서명자와 일치해야만 발급한다.
    const want = makeMatchKey(inst.signer?.name, inst.signer?.birth);
    const got = makeMatchKey(name, birth);
    if (!want || !got || want !== got) {
      await auditAccessDeny({ actor: ip, endpoint: "/api/v1/idv/issue", reason: "signer_mismatch" });
      return NextResponse.json(
        { ok: false, error: "계약서의 계약자 정보와 일치하지 않습니다. 담당자에게 문의해 주세요.", code: "SIGNER_MISMATCH" },
        { status: 403 },
      );
    }

    // 이 계약의 손님에게 한 번만 부여되는 불변 ID. 재진입 시 같은 값을 쓴다.
    const userId = inst.subjectUserId || randomUUID();
    if (!inst.subjectUserId) {
      await attachSubject(contractId, { subjectUserId: userId, matchKey: got });
    }

    const token = issueIdentityToken({ userId, name, birth, phone, method });
    await writeAudit({
      action: "idv_issue",
      actor: userId,
      meta: { contractId, memberCompany: inst.memberCompany, method, ip, scope: "contract" },
    });
    // 「제출됨」이지 「확인됨」이 아니다 — 화면 문구가 이 값을 따라야 한다.
    return NextResponse.json({ ok: true, token, meaning: "submitted" });
  }

  /* ── ② 계약 없이 — 데모 전용 ───────────────────────────── */
  if (!DEMO_MODE) {
    await auditAccessDeny({ actor: ip, endpoint: "/api/v1/idv/issue", reason: "prod_idv_stub_blocked" });
    return NextResponse.json(
      { ok: false, error: "계약 링크를 통해서만 본인확인을 진행할 수 있습니다.", code: "CONTRACT_REQUIRED" },
      { status: 501 },
    );
  }

  const userId = resolveDemoUserId({ name, birth });
  if (!userId) {
    // 임의 name+birth로 토큰을 내주면 idv/issue→check 체인으로
    // '아무 사람이나 이력 조회'하는 존재여부 오라클이 재구성된다(I2·I3).
    await auditAccessDeny({ actor: ip, endpoint: "/api/v1/idv/issue", reason: "demo_non_sample_identity" });
    return NextResponse.json(
      { ok: false, error: "시연은 제공된 샘플 인물로만 진행할 수 있습니다.", code: "DEMO_SAMPLE_ONLY" },
      { status: 403 },
    );
  }
  try {
    const token = issueIdentityToken({ userId, name, birth, phone, method });
    // userId를 응답에 실지 않음 — 존재여부 오라클·전역상관ID 누출 방지. 토큰 안에만 담김.
    return NextResponse.json({ ok: true, token, meaning: "submitted" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "발급 실패" }, { status: e?.status || 500 });
  }
}
