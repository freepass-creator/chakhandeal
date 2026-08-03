import { NextResponse } from "next/server";
import { resolveActor, requireActor } from "@/lib/server/session";
import { getAdmin } from "@/lib/server/admin";
import { mockListConsents } from "@/lib/server/mockStore";
import { canReadTransaction, auditAccessDeny } from "@/lib/server/authz";

export const runtime = "nodejs";

function publicConsent(c) {
  const { matchKey, subjectUserId, ownerCompanyId, ...rest } = c;
  void matchKey; void subjectUserId; void ownerCompanyId;
  return rest;
}

/** GET /api/v1/consents — 로그인 회원사 스코프 + canRead 최종확인 */
export async function GET(req) {
  try {
    const actor = requireActor(await resolveActor(req), { roles: ["member", "admin"] });
    const qCompany = req.nextUrl.searchParams.get("company") || "";
    const company = actor.role === "admin" ? qCompany : actor.company;
    const companyId = actor.role === "admin" ? "" : (actor.companyId || "");

    const { ready, db } = getAdmin();
    let consents = [];
    if (ready) {
      let rows = [];
      const seen = new Set();
      const push = (list) => {
        list.forEach((r) => {
          if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
        });
      };
      if (companyId) {
        try {
          const snap = await db.collection("consents").where("ownerCompanyId", "==", companyId).get();
          push(snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || data.createdAt || 0,
            };
          }));
        } catch { /* index 없을 수 있음 */ }
      }
      if (company) {
        const snap = await db.collection("consents").where("company", "==", company).get();
        push(snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || data.createdAt || 0,
          };
        }));
      } else if (actor.role === "admin" && !companyId) {
        const snap = await db.collection("consents").orderBy("createdAt", "desc").limit(100).get();
        push(snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || data.createdAt || 0,
          };
        }));
      }
      consents = rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      consents = mockListConsents(company || undefined, companyId || undefined);
    }
    const scoped = actor.role === "admin"
      ? consents
      : consents.filter((c) => canReadTransaction(actor, c));
    return NextResponse.json({ ok: true, consents: scoped.map(publicConsent) });
  } catch (e) {
    if (e?.denyReason || e?.status === 401 || e?.status === 403) {
      await auditAccessDeny({
        actor: "anonymous",
        endpoint: "/api/v1/consents",
        reason: e.denyReason || "actor_denied",
      });
    }
    return NextResponse.json({ ok: false, error: e?.message || "실패" }, { status: e?.status || 500 });
  }
}
