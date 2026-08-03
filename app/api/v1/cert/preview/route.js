import { NextResponse } from "next/server";
import { buildCertificateDraft, submitCertificate } from "@/lib/server/certificate";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { cleanBirth } from "@/lib/format";
import { DEMO_MODE } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * POST /api/v1/cert/preview
 * 본인이 자신의 증명서 초안을 봄 (사업자 검색 아님)
 * body: { name, birth, vertical?, method? }
 */
export async function POST(req) {
  // {이름,생년월일}만으로 위반이력 유무를 회수하는 조회 오라클 — 운영에서는 본인확인 세션 바인딩 전까지 차단.
  // TODO(운영): 서버 발급 본인확인 토큰((name,birth,phone) 바인딩)으로 소유 증명 후에만 허용.
  if (!DEMO_MODE) {
    return NextResponse.json({ ok: false, error: "본인확인을 거친 뒤 이용할 수 있습니다.", code: "AUTH_REQUIRED" }, { status: 403 });
  }
  const ip = clientIp(req);
  const rl = rateLimit(`cert-preview:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }
  const name = String(body?.name || "").trim();
  const birth = cleanBirth(body?.birth);
  if (!name || birth.length !== 6) {
    return NextResponse.json({ ok: false, error: "이름·생년월일 필요" }, { status: 400 });
  }

  try {
    const draft = await buildCertificateDraft({
      name,
      birth,
      vertical: body.vertical || "rent",
      method: body.method || "",
    });
    const { _internalTypes, ...publicDraft } = draft;
    void _internalTypes;
    return NextResponse.json({ ok: true, draft: publicDraft });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "발급 실패" }, { status: 500 });
  }
}
