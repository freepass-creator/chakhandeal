import { NextResponse } from "next/server";
import { resolveActor, requireActor } from "@/lib/server/session";
import { getAdmin } from "@/lib/server/admin";
import { mockListConsents } from "@/lib/server/mockStore";

export const runtime = "nodejs";

// 응답 최소화 — 전역 조인/상관 식별자(matchKey·subjectUserId·ownerCompanyId)는 회원사 콘솔에 싣지 않는다.
// 회사끼리 동일인 대조 방지(스펙 I2·I3) + 향후 회사별 토큰 전환 부채 예방.
// verified(이름·생년)는 자기 회사(isOwnerCompany)의 동의 레코드라 유지 — 위반등록 프리필에 사용.
// TODO(Phase 5/6): verified.phone 등 최소화·마스킹 재검토.
function publicConsent(c) {
  const { matchKey, subjectUserId, ownerCompanyId, ...rest } = c;
  void matchKey; void subjectUserId; void ownerCompanyId;
  return rest;
}

/** GET /api/v1/consents — 로그인 회원사 스코프 (admin은 ?company= 또는 전체) */
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
    return NextResponse.json({ ok: true, consents: consents.map(publicConsent) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "실패" }, { status: e?.status || 500 });
  }
}
