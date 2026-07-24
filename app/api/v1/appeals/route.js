import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/server/admin";
import { mockAddAppeal } from "@/lib/server/mockStore";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { cleanBirth } from "@/lib/format";

export const runtime = "nodejs";

/** POST /api/v1/appeals — 손님 소명 신청 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`appeal:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const name = String(body?.name || "").trim();
  const birth = cleanBirth(body?.birth);
  if (!name || birth.length !== 6) {
    return NextResponse.json({ ok: false, error: "이름·생년월일 필요" }, { status: 400 });
  }

  const payload = {
    name,
    birth,
    type: body.type || "",
    note: body.note || "",
    channel: body.channel || "self",
    status: "pending",
  };

  const { ready, db } = getAdmin();
  let id;
  if (ready) {
    const ref = await db.collection("appeals").add({ ...payload, createdAt: new Date() });
    id = ref.id;
  } else {
    id = mockAddAppeal(payload);
  }
  return NextResponse.json({ ok: true, id });
}
