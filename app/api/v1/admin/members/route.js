import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { resolveActor, requireActor } from "@/lib/server/session";
import { getAdmin } from "@/lib/server/admin";
import {
  mockListPendingMembers, mockApproveMember, mockRejectMember,
} from "@/lib/server/mockStore";
import { writeAudit } from "@/lib/server/audit";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

function genCode() {
  let r = "";
  for (let i = 0; i < 4; i++) r += Math.floor(Math.random() * 10);
  return r;
}

/** GET /api/v1/admin/members — pending 목록 */
export async function GET(req) {
  try {
    requireActor(await resolveActor(req), { roles: ["admin"] });
    const { ready, db } = getAdmin();
    let members = [];
    if (ready) {
      const snap = await db.collection("members").where("status", "==", "pending").get();
      members = snap.docs.map((d) => {
        const data = d.data();
        // 비밀번호 등 민감필드 제외
        const { pw, ...rest } = data;
        return {
          id: d.id,
          ...rest,
          createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || data.createdAt || 0,
        };
      }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      members = mockListPendingMembers().map(({ pw, ...rest }) => rest);
    }
    return NextResponse.json({ ok: true, members });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "실패" }, { status: e?.status || 500 });
  }
}

/** POST /api/v1/admin/members — { action: approve|reject, id } */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`admin-members:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });

  try {
    const actor = requireActor(await resolveActor(req), { roles: ["admin"] });
    const body = await req.json();
    const id = body?.id;
    if (!id || !["approve", "reject"].includes(body?.action)) {
      return NextResponse.json({ ok: false, error: "action·id 필요" }, { status: 400 });
    }

    const { ready, db } = getAdmin();
    if (body.action === "approve") {
      const code = genCode();
      if (ready) {
        const snap = await db.collection("members").doc(id).get();
        if (!snap.exists) return NextResponse.json({ ok: false, error: "회원 없음" }, { status: 404 });
        const existing = snap.data()?.companyId;
        const companyId = existing || randomUUID();
        await db.collection("members").doc(id).update({
          status: "approved",
          code,
          companyId,
          approvedAt: new Date(),
        });
        await writeAudit({ action: "member_approve", actor: actor.email, meta: { id, code, companyId } });
        return NextResponse.json({ ok: true, code, companyId });
      }
      const companyId = randomUUID();
      const m = mockApproveMember(id, code, companyId);
      if (!m) return NextResponse.json({ ok: false, error: "회원 없음" }, { status: 404 });
      await writeAudit({ action: "member_approve", actor: actor.email, meta: { id, code, companyId: m.companyId } });
      return NextResponse.json({ ok: true, code, companyId: m.companyId });
    }

    if (ready) {
      await db.collection("members").doc(id).update({ status: "rejected", rejectedAt: new Date() });
    } else {
      const m = mockRejectMember(id);
      if (!m) return NextResponse.json({ ok: false, error: "회원 없음" }, { status: 404 });
    }
    await writeAudit({ action: "member_reject", actor: actor.email, meta: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "실패" }, { status: e?.status || 500 });
  }
}
