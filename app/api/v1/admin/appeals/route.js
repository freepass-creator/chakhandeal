import { NextResponse } from "next/server";
import { resolveActor, requireActor } from "@/lib/server/session";
import { resolveAppealServer } from "@/lib/server/risks";
import { getAdmin } from "@/lib/server/admin";
import { mockListAppeals } from "@/lib/server/mockStore";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

/** GET /api/v1/admin/appeals */
export async function GET(req) {
  try {
    requireActor(await resolveActor(req), { roles: ["admin"] });
    const { ready, db } = getAdmin();
    let appeals = [];
    if (ready) {
      const snap = await db.collection("appeals").orderBy("createdAt", "desc").get();
      appeals = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || data.createdAt || 0,
        };
      });
    } else {
      appeals = mockListAppeals();
    }
    return NextResponse.json({ ok: true, appeals });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "실패" }, { status: e?.status || 500 });
  }
}

/** POST /api/v1/admin/appeals — { action:'resolve', appeal } */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`admin-appeal:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });

  try {
    requireActor(await resolveActor(req), { roles: ["admin"] });
    const body = await req.json();
    if (body?.action !== "resolve" || !body?.appeal) {
      return NextResponse.json({ ok: false, error: "action=resolve 와 appeal 이 필요합니다." }, { status: 400 });
    }
    await resolveAppealServer(body.appeal);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "실패" }, { status: e?.status || 500 });
  }
}
