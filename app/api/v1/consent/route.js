import { NextResponse } from "next/server";
import { completeConsent } from "@/lib/server/consent";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { DEMO_MODE } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/v1/consent
 * body: { name, phone, company, code, vertical?, verified, signed, photos|idImage|faceImage }
 */
export async function POST(req) {
  // 무인증 {name,birth}로 cert(unresolved/count/types)를 회수하는 조회 오라클 + 임의 신원 검증서 주입 표면.
  // 운영에서는 본인확인 세션 바인딩 전까지 차단 — 스펙 §1(존재 여부조차 비노출)·§13(canReadTransaction) 반영.
  // TODO(운영): 서버 발급 본인확인 토큰으로 정보주체 본인임을 증명한 요청만 허용.
  if (!DEMO_MODE) {
    return NextResponse.json({ ok: false, error: "본인확인을 거친 뒤 이용할 수 있습니다.", code: "AUTH_REQUIRED" }, { status: 403 });
  }
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
    return NextResponse.json({ ok: true, id: result.id, cert: result.cert, certId: result.certId || "" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "동의 저장 실패" }, { status: 500 });
  }
}
