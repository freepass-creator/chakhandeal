import { NextResponse } from "next/server";
import { getCertificate, listCertificatesForProvider } from "@/lib/server/certificate";
import { resolveActor, requireActor } from "@/lib/server/session";
import { canReadTransaction, auditAccessDeny } from "@/lib/server/authz";
import { clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

/**
 * GET /api/v1/cert?id=…  — 검증 링크 (카톡·문자, 비로그인 가능 · 만료 강제) — Phase 4까지 grant 전 현행 유지
 * GET /api/v1/cert        — 로그인 회원사: companyId 스코프 + canRead 최종확인
 */
export async function GET(req) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const cert = await getCertificate(id, { auditView: true, actor: clientIp(req) });
    if (!cert) return NextResponse.json({ ok: false, error: "없음" }, { status: 404 });
    if (cert.expired) {
      return NextResponse.json(
        { ok: false, error: "이 상태 링크는 만료되었습니다. 새로 만들어 전달해 주세요.", code: "EXPIRED" },
        { status: 410 },
      );
    }
    const { subjectBirth, subjectPhone, subjectName, subjectUserId, ownerCompanyId, matchKey, ...safe } = cert;
    void subjectName; void subjectUserId; void ownerCompanyId; void matchKey;
    return NextResponse.json({
      ok: true,
      cert: {
        ...safe,
        subjectBirthMasked: subjectBirth ? `${String(subjectBirth).slice(0, 2)}****` : "",
        subjectNameMasked: cert.subjectName
          ? `${cert.subjectName[0]}${"○".repeat(Math.max(0, cert.subjectName.length - 1))}`
          : "",
      },
    });
  }

  try {
    const actor = requireActor(await resolveActor(req), { roles: ["member", "admin"] });
    const list = await listCertificatesForProvider({
      company: actor.company,
      code: actor.code,
      companyId: actor.companyId || "",
    });
    // companyId 스코프 후 canRead로 최종 필터(타사·스푸핑 방어)
    const scoped = list.filter((c) => canReadTransaction(actor, c));
    const safeList = scoped.map(({ subjectBirth, subjectPhone, subjectUserId, ownerCompanyId, matchKey, ...rest }) => {
      void subjectPhone; void subjectUserId; void ownerCompanyId; void matchKey;
      return { ...rest, subjectBirthMasked: subjectBirth ? `${String(subjectBirth).slice(0, 2)}****` : "" };
    });
    return NextResponse.json({ ok: true, certificates: safeList });
  } catch (e) {
    if (e?.denyReason || e?.status === 401 || e?.status === 403) {
      await auditAccessDeny({
        actor: "anonymous",
        endpoint: "/api/v1/cert",
        reason: e.denyReason || "actor_denied",
      });
    }
    return NextResponse.json({ ok: false, error: e?.message || "인증 필요" }, { status: e?.status || 401 });
  }
}
