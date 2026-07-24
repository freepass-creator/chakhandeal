import { NextResponse } from "next/server";
import { resolveActor, requireActor } from "@/lib/server/session";
import { getAdmin } from "@/lib/server/admin";
import { mockListConsents } from "@/lib/server/mockStore";

export const runtime = "nodejs";

/** GET /api/v1/consents — 로그인 회원사 스코프 (admin은 ?company= 또는 전체) */
export async function GET(req) {
  try {
    const actor = requireActor(await resolveActor(req), { roles: ["member", "admin"] });
    const qCompany = req.nextUrl.searchParams.get("company") || "";
    const company = actor.role === "admin" ? qCompany : actor.company;

    const { ready, db } = getAdmin();
    let consents = [];
    if (ready) {
      let snap;
      if (company) {
        snap = await db.collection("consents").where("company", "==", company).get();
      } else {
        snap = await db.collection("consents").orderBy("createdAt", "desc").limit(100).get();
      }
      consents = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || data.createdAt || 0,
        };
      }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      consents = mockListConsents(company || undefined);
    }
    return NextResponse.json({ ok: true, consents });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "실패" }, { status: e?.status || 500 });
  }
}
