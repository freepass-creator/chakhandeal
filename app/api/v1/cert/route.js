import { NextResponse } from "next/server";
import { getCertificate, listCertificatesForProvider } from "@/lib/server/certificate";
import { resolveActor, requireActor } from "@/lib/server/session";

export const runtime = "nodejs";

/**
 * GET /api/v1/cert?id=…  — 검증 링크 (카톡·문자, 비로그인 가능 · 만료 강제)
 * GET /api/v1/cert        — 로그인 회원사: 코드/상호로 귀속된 검증 수신 목록
 */
export async function GET(req) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const cert = await getCertificate(id);
    if (!cert) return NextResponse.json({ ok: false, error: "없음" }, { status: 404 });
    if (cert.expired) {
      return NextResponse.json(
        { ok: false, error: "이 상태 링크는 만료되었습니다. 새로 만들어 전달해 주세요.", code: "EXPIRED" },
        { status: 410 },
      );
    }
    const { subjectBirth, subjectPhone, ...safe } = cert;
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
    });
    return NextResponse.json({ ok: true, certificates: list });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "인증 필요" }, { status: e?.status || 401 });
  }
}
