import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/server/admin";
import { mockFindMemberByCode } from "@/lib/server/mockStore";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { DEMO_MEMBERS } from "@/lib/constants";

export const runtime = "nodejs";

/** GET /api/v1/member/by-code?code=1001 */
export async function GET(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`member-code:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });

  const code = (req.nextUrl.searchParams.get("code") || "").trim();
  if (!code) return NextResponse.json({ ok: false, error: "code 필요" }, { status: 400 });

  const demo = DEMO_MEMBERS.find((m) => m.code === code);
  if (demo) return NextResponse.json({ ok: true, member: demo });

  const mock = mockFindMemberByCode(code);
  if (mock) {
    return NextResponse.json({
      ok: true,
      member: { code, company: mock.company, service: mock.service || "", vertical: mock.vertical || "rent" },
    });
  }

  const { ready, db } = getAdmin();
  if (!ready) return NextResponse.json({ ok: false, error: "미등록 코드" }, { status: 404 });

  try {
    const snap = await db.collection("members").where("code", "==", code).where("status", "==", "approved").limit(1).get();
    if (snap.empty) return NextResponse.json({ ok: false, error: "미등록 코드" }, { status: 404 });
    const d = snap.docs[0].data();
    return NextResponse.json({
      ok: true,
      member: { code, company: d.company || "", service: d.service || "", vertical: d.vertical || "rent" },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "조회 실패" }, { status: 500 });
  }
}
