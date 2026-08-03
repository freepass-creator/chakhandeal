import { NextResponse } from "next/server";
import { getCertificate, listCertificatesForProvider } from "@/lib/server/certificate";
import { resolveActor, requireActor } from "@/lib/server/session";
import { canReadTransaction, auditAccessDeny } from "@/lib/server/authz";
import { clientIp } from "@/lib/server/rateLimit";
import { revealPii } from "@/lib/server/piiVault";

export const runtime = "nodejs";

/**
 * GET /api/v1/cert?id=…  — 검증 링크: 복호 없이 draft+마스킹만
 * GET /api/v1/cert        — 회원사: canRead 후 이름만 vault 복호(생년·전화 마스킹)
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
    const {
      subjectBirth, subjectPhone, subjectName, subjectUserId, ownerCompanyId, matchKey,
      piiRef, phone_lookup_token, ...safe
    } = cert;
    void subjectName; void subjectUserId; void ownerCompanyId; void matchKey;
    void subjectBirth; void subjectPhone; void piiRef; void phone_lookup_token;
    return NextResponse.json({
      ok: true,
      cert: {
        ...safe,
        subjectBirthMasked: cert.subjectBirthMasked || (subjectBirth ? `${String(subjectBirth).slice(0, 2)}****` : ""),
        subjectNameMasked: cert.subjectNameMasked || (cert.subjectName
          ? `${cert.subjectName[0]}${"○".repeat(Math.max(0, cert.subjectName.length - 1))}`
          : ""),
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
    const scoped = list.filter((c) => canReadTransaction(actor, c));
    const safeList = [];
    for (const c of scoped) {
      const {
        subjectBirth, subjectPhone, subjectUserId, ownerCompanyId, matchKey,
        piiRef, phone_lookup_token, subjectName, ...rest
      } = c;
      void subjectPhone; void subjectUserId; void ownerCompanyId; void matchKey;
      void phone_lookup_token; void subjectName; void subjectBirth;

      let subjectNameOut = "";
      if (piiRef && actor.role !== "admin") {
        const pii = await revealPii(piiRef, ["name"]);
        subjectNameOut = pii.name || "";
      }
      safeList.push({
        ...rest,
        subjectName: subjectNameOut,
        subjectNameMasked: c.subjectNameMasked || (subjectNameOut
          ? `${subjectNameOut[0]}${"○".repeat(Math.max(0, subjectNameOut.length - 1))}`
          : ""),
        subjectBirthMasked: c.subjectBirthMasked || "",
        company_user_token: c.company_user_token || "",
      });
    }
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
