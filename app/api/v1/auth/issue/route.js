import { NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/constants";
import { issueDemoToken } from "@/lib/server/session";
import { mockFindMemberByEmail } from "@/lib/server/mockStore";
import { CID_TEST_RENT, CID_PET } from "@/lib/server/ids";
import { verifyPassword } from "@/lib/server/password";

export const runtime = "nodejs";

const MOCK_PW = { "dudguq@gmail.com": "1234", "test@test.com": "test1234", "pet@test.com": "test1234" };
const BUILTIN = {
  "dudguq@gmail.com": { company: "착한거래 관리자", role: "admin", code: "", status: "approved" },
  "test@test.com": { company: "테스트렌탈", role: "member", code: "1001", status: "approved", vertical: "rent", companyId: CID_TEST_RENT },
  "pet@test.com": { company: "해피펫분양", role: "member", code: "2001", status: "approved", vertical: "pet", companyId: CID_PET },
};

function demoLoginAllowed() {
  if (DEMO_MODE) return true;
  if (process.env.ALLOW_DEMO_LOGIN === "1") return true;
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

/** POST /api/v1/auth/issue — 데모 HMAC 토큰 (운영에서는 ALLOW_DEMO_LOGIN=1 필요) */
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }
  const email = String(body?.email || "").trim().toLowerCase();
  const pw = String(body?.pw || "");
  if (!email || !pw) {
    return NextResponse.json({ ok: false, error: "이메일·비밀번호가 필요합니다." }, { status: 400 });
  }

  if (MOCK_PW[email] && MOCK_PW[email] === pw) {
    if (!demoLoginAllowed()) {
      return NextResponse.json({ ok: false, error: "데모 로그인은 비활성화되어 있습니다." }, { status: 403 });
    }
    const b = BUILTIN[email];
    const session = { email, ...b, uid: email };
    return NextResponse.json({ ok: true, token: issueDemoToken(session), session });
  }

  const m = mockFindMemberByEmail(email);
  if (m && await verifyPassword(pw, m.pw)) {
    if (m.status !== "approved") {
      return NextResponse.json({ ok: false, error: "승인 대기 중이거나 반려된 계정입니다." }, { status: 403 });
    }
    const session = {
      uid: m.id,
      email: m.email,
      company: m.company,
      role: m.role || "member",
      code: m.code || "",
      status: m.status,
      vertical: m.vertical || "rent",
      companyId: m.companyId || "",
    };
    return NextResponse.json({ ok: true, token: issueDemoToken(session), session });
  }

  return NextResponse.json({ ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
}
