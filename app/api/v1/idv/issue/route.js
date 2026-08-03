import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { issueIdentityToken } from "@/lib/server/identityToken";
import { DEMO_USER_IDS } from "@/lib/server/ids";
import { DEMO_USERS } from "@/lib/demo";
import { DEMO_MODE } from "@/lib/constants";
import { cleanBirth } from "@/lib/format";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { auditAccessDeny } from "@/lib/server/authz";

export const runtime = "nodejs";

/** 데모 샘플 인물 → 시드 userId. 실 IdV 도입 시 phone_lookup_token dedup으로 교체(TODO). */
function resolveUserId({ name, birth }) {
  const n = String(name || "").trim();
  const b = cleanBirth(birth);
  for (const [key, u] of Object.entries(DEMO_USERS)) {
    if (u.name === n && cleanBirth(u.birth) === b) {
      return u.userId || DEMO_USER_IDS[key] || randomUUID();
    }
  }
  return randomUUID();
}

/**
 * POST /api/v1/idv/issue — 본인확인 토큰 발급(스텁).
 * AuthFlow onVerified 시점에 호출. 실 PASS 연동 시 이 라우트 내부만 교체.
 * 운영: 무인증 name+birth 발급 금지(실 IdV 콜백 전 501).
 * 데모: 스텁 유지, 응답에 userId 미노출(토큰만).
 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`idv-issue:${ip}`, { limit: 40, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  if (!DEMO_MODE) {
    await auditAccessDeny({ actor: ip, endpoint: "/api/v1/idv/issue", reason: "prod_idv_stub_blocked" });
    return NextResponse.json(
      { ok: false, error: "실 본인확인 연동 후 이용할 수 있습니다.", code: "IDV_REQUIRED" },
      { status: 501 },
    );
  }

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const name = String(body?.name || "").trim();
  const birth = cleanBirth(body?.birth);
  const phone = String(body?.phone || "").trim();
  const method = String(body?.method || "unknown");
  if (!name || birth.length !== 6) {
    return NextResponse.json({ ok: false, error: "name·birth 필요" }, { status: 400 });
  }

  const userId = resolveUserId({ name, birth });
  try {
    const token = issueIdentityToken({ userId, name, birth, phone, method });
    // 데모: userId를 응답에 실지 않음 — 존재여부 오라클·전역상관ID 누출 방지. 토큰 안에만 담김.
    return NextResponse.json({ ok: true, token });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "발급 실패" }, { status: e?.status || 500 });
  }
}
