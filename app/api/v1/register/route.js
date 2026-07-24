import { NextResponse } from "next/server";
import { registerRisk } from "@/lib/server/risks";
import { resolveActor, requireActor } from "@/lib/server/session";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { cleanBirth } from "@/lib/format";

export const runtime = "nodejs";

/**
 * POST /api/v1/register
 * Authorization: Bearer <token> 필수
 * body: { name, birth, type, license?, phone?, reason?, evidence? }
 * company 는 세션에서 강제 (위조 방지)
 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`register:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let actor;
  try {
    actor = requireActor(await resolveActor(req), { roles: ["member", "admin"] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "인증 필요" }, { status: e?.status || 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const name = String(body?.name || "").trim();
  const birth = cleanBirth(body?.birth);
  const type = String(body?.type || "").trim();
  const company = actor.role === "admin" && body?.company ? String(body.company).trim() : (actor.company || "");
  const vertical = body?.vertical || actor.vertical || "rent";
  if (!name || birth.length !== 6) {
    return NextResponse.json({ ok: false, error: "이름·생년월일(6자리)이 필요합니다." }, { status: 400 });
  }
  if (!type) {
    return NextResponse.json({ ok: false, error: "위반 유형이 필요합니다." }, { status: 400 });
  }
  if (!company) {
    return NextResponse.json({ ok: false, error: "회원사 정보가 없습니다. 다시 로그인해 주세요." }, { status: 400 });
  }
  if (!body?.evidence) {
    return NextResponse.json({ ok: false, error: "증빙이 필요합니다." }, { status: 400 });
  }

  try {
    const { id } = await registerRisk(
      {
        name,
        birth,
        type,
        vertical,
        company,
        license: body.license || "",
        phone: body.phone || "",
        reason: body.reason || "",
        evidence: body.evidence,
      },
      actor.email || company
    );
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "등록 실패" }, { status: e?.status || 500 });
  }
}
