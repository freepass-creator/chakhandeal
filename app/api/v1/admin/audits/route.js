import { NextResponse } from "next/server";
import { resolveActor, requireActor } from "@/lib/server/session";
import { listAudits } from "@/lib/server/audit";

export const runtime = "nodejs";

/** GET /api/v1/admin/audits?limit=50 */
export async function GET(req) {
  try {
    requireActor(await resolveActor(req), { roles: ["admin"] });
    const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 50)));
    const audits = await listAudits(limit);
    return NextResponse.json({ ok: true, audits });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "실패" }, { status: e?.status || 500 });
  }
}
