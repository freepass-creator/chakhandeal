import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/server/admin";
import { mockFindMemberByCode } from "@/lib/server/mockStore";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const DEMO_MEMBERS = [
  { code: "1001", company: "테스트렌탈", service: "렌탈", vertical: "rent" },
  { code: "1002", company: "스피드렌탈", service: "렌탈", vertical: "rent" },
  { code: "1003", company: "하나모빌리티", service: "렌탈", vertical: "rent" },
  { code: "2001", company: "해피펫분양", service: "반려 분양", vertical: "pet" },
  { code: "2002", company: "따뜻한구조", service: "구조·입양", vertical: "pet" },
];

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
