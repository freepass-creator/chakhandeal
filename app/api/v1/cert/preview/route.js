import { NextResponse } from "next/server";
import { buildCertificateDraft } from "@/lib/server/certificate";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { requireVerifiedSubject } from "@/lib/server/authz";

export const runtime = "nodejs";

/**
 * POST /api/v1/cert/preview — 본인 증명서 초안(토큰-only).
 * body: { identityToken?, vertical?, method? } — name+birth 파라미터 제거
 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`cert-preview:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });

  let body = {};
  try { body = await req.json(); } catch { body = {}; }

  let subject;
  try {
    subject = await requireVerifiedSubject(req, body, { endpoint: "/api/v1/cert/preview" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "본인확인 필요", code: e?.code || "AUTH_REQUIRED" },
      { status: e?.status || 401 },
    );
  }

  try {
    const draft = await buildCertificateDraft({
      matchKey: subject.matchKey,
      vertical: body.vertical || "rent",
      method: body.method || subject.method || "",
    });
    const { _internalTypes, ...publicDraft } = draft;
    void _internalTypes;
    return NextResponse.json({ ok: true, draft: publicDraft });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "발급 실패" }, { status: e?.status || 500 });
  }
}
