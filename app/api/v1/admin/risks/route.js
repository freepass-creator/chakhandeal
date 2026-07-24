import { NextResponse } from "next/server";
import { resolveActor, requireActor } from "@/lib/server/session";
import { listAllRisks, resolveAppealServer } from "@/lib/server/risks";
import { getAdmin } from "@/lib/server/admin";
import { mockListAppeals, mockResolveAppeal, mockAddAppeal } from "@/lib/server/mockStore";
import { cleanBirth } from "@/lib/format";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

/** GET /api/v1/admin/risks — 관리자 전체 위험 목록 */
export async function GET(req) {
  try {
    const actor = requireActor(await resolveActor(req), { roles: ["admin"] });
    const risks = await listAllRisks();
    return NextResponse.json({ ok: true, risks, actor: actor.email });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "실패" }, { status: e?.status || 500 });
  }
}
