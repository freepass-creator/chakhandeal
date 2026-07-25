import { NextResponse } from "next/server";
import { buildCertificateDraft, submitCertificate } from "@/lib/server/certificate";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { cleanBirth } from "@/lib/format";

export const runtime = "nodejs";

/**
 * POST /api/v1/cert/preview
 * 본인이 자신의 증명서 초안을 봄 (사업자 검색 아님)
 * body: { name, birth, vertical?, method? }
 */
export async function POST(req) {
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
