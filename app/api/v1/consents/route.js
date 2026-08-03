import { NextResponse } from "next/server";
import { resolveActor, requireActor } from "@/lib/server/session";
import { getAdmin } from "@/lib/server/admin";
import { mockListConsents } from "@/lib/server/mockStore";
import { canReadTransaction, auditAccessDeny } from "@/lib/server/authz";
import { revealPii } from "@/lib/server/piiVault";

export const runtime = "nodejs";

/** 가명 응답 — 전역 식별자 strip. 오너만 vault에서 이름·생년 복호(표시용). */
async function publicConsent(c, { decrypt = false } = {}) {
  const {
    matchKey, subjectUserId, ownerCompanyId, piiRef, phone_lookup_token,
    ...rest
  } = c;
  void matchKey; void subjectUserId; void ownerCompanyId; void phone_lookup_token;

  const out = {
    ...rest,
    company_user_token: c.company_user_token || "",
  };
  if (decrypt && piiRef) {
    const pii = await revealPii(piiRef, ["name", "birth"]);
    out.name = pii.name || "";
    out.verified = {
      ...(c.verified || {}),
      birth: pii.birth || "",
    };
  } else {
    out.name = out.name || "";
    if (out.verified) {
      out.verified = { method: out.verified.method, verifiedAt: out.verified.verifiedAt };
    }
  }
  return out;
}

/** GET /api/v1/consents — 로그인 회원사 스코프 + canRead 후 필요시 복호 */
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

    const out = [];
    for (const c of scoped) {
      const allowDecrypt = actor.role === "admin" || canReadTransaction(actor, c);
      out.push(await publicConsent(c, { decrypt: allowDecrypt && actor.role !== "admin" }));
    }
    // admin: Phase 6 전까지 복호 안 함(가명 뷰)
    return NextResponse.json({ ok: true, consents: out });
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
