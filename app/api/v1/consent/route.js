import { NextResponse } from "next/server";
import { completeConsent } from "@/lib/server/consent";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/v1/consent
 * body: { name, phone, company, code, verified, signed, photos|idImage|faceImage }
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

  if (!body?.name || !body?.company || !body?.verified?.birth) {
    return NextResponse.json({ ok: false, error: "name·company·verified.birth 가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await completeConsent(body, ip);
    return NextResponse.json({ ok: true, id: result.id, cert: result.cert });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "동의 저장 실패" }, { status: 500 });
  }
}
