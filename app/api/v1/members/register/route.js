import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/server/admin";
import { mockAddMember, mockFindMemberByEmail } from "@/lib/server/mockStore";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { writeAudit } from "@/lib/server/audit";

export const runtime = "nodejs";

/**
 * POST /api/v1/members/register
 * 데모(Admin 미설정) 전용 가입 접수 — 서버 mock members에 pending 저장
 * Firebase 모드에서는 클라이언트가 Auth+Firestore 직접 가입
 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`member-reg:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });

  const { ready } = getAdmin();
  if (ready) {
    return NextResponse.json({ ok: false, error: "Firebase 모드에서는 클라이언트 가입을 사용하세요.", useClient: true }, { status: 400 });
  }

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const pw = String(body?.pw || "");
  const company = String(body?.company || "").trim();
  if (!email || !pw || !company) {
    return NextResponse.json({ ok: false, error: "회사명·이메일·비밀번호 필요" }, { status: 400 });
  }
  if (mockFindMemberByEmail(email) || email === "dudguq@gmail.com" || email === "test@test.com" || email === "pet@test.com") {
    return NextResponse.json({ ok: false, error: "이미 가입된 이메일입니다." }, { status: 409 });
  }
  if (!body.bizImage || !body.ceoIdImage) {
    return NextResponse.json({ ok: false, error: "서류 첨부 필요" }, { status: 400 });
  }

  try {
    const row = mockAddMember({
      id: email,
      email,
      pw, // 데모 전용 — 실서비스에서는 절대 평문 저장 금지
      company,
      role: "member",
      code: "",
      service: body.service || "",
      vertical: body.vertical || "rent",
      bizNo: body.bizNo || "",
      ceo: body.ceo || "",
      industry: body.industry || "",
      status: "pending",
      bizImage: body.bizImage,
      ceoIdImage: body.ceoIdImage,
    });
    await writeAudit({ action: "member_register", actor: email, meta: { company } });
    return NextResponse.json({ ok: true, id: row.id, pending: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "가입 실패" }, { status: e?.status || 500 });
  }
}
