import { NextResponse } from "next/server";
import { completeConsent } from "@/lib/server/consent";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { requireVerifiedSubject } from "@/lib/server/authz";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/v1/consent — 토큰-only.
 * body: { identityToken, name, phone, company, code, vertical?, verified, signed, photos… }
 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`consent:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  let subject;
  try {
    subject = await requireVerifiedSubject(req, body, { endpoint: "/api/v1/consent" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "본인확인 필요", code: e?.code || "AUTH_REQUIRED" },
      { status: e?.status || 401 },
    );
  }

  if (!body?.name || !body?.company) {
    return NextResponse.json({ ok: false, error: "name·company 가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await completeConsent(body, ip, subject);
    return NextResponse.json({ ok: true, id: result.id, cert: result.cert, certId: result.certId || "" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "동의 저장 실패" }, { status: e?.status || 500 });
  }
}
