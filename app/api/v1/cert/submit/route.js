import { NextResponse } from "next/server";
import { buildCertificateDraft, submitCertificate } from "@/lib/server/certificate";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { cleanBirth } from "@/lib/format";
import { getAdmin } from "@/lib/server/admin";
import { mockFindMemberByCode } from "@/lib/server/mockStore";
import { DEMO_MEMBERS, DEMO_MODE } from "@/lib/constants";
import { verifyIdentityToken } from "@/lib/server/identityToken";

export const runtime = "nodejs";

async function resolveProvider(code) {
  const c = (code || "").trim();
  const d = DEMO_MEMBERS.find((x) => x.code === c);
  if (d) return d;
  const m = mockFindMemberByCode(c);
  if (m) return { code: c, company: m.company, service: m.service || "", vertical: m.vertical, companyId: m.companyId || "" };
  const { ready, db } = getAdmin();
  if (!ready) return null;
  const snap = await db.collection("members").where("code", "==", c).where("status", "==", "approved").limit(1).get();
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return { code: c, company: data.company, service: data.service || "", vertical: data.vertical, companyId: data.companyId || "" };
}

function resolveSubjectUserId(body) {
  if (body.subjectUserId || body.userId) return body.subjectUserId || body.userId;
  if (body.identityToken) {
    const v = verifyIdentityToken(body.identityToken);
    if (v?.userId) return v.userId;
  }
  return "";
}

/**
 * POST /api/v1/cert/submit
 * body: { name, birth, phone?, method?, vertical, providerCode, signed? }
 */
export async function POST(req) {
  // 무인증으로 '본인확인 완료' 검증서를 임의 신원에 발급·회원사 콘솔에 주입할 수 있는 표면.
  // 운영에서는 본인확인 세션 바인딩 전까지 차단(동의 흐름의 서버 내부 발급은 completeConsent 경유로 별개).
  // TODO(운영): 서버 발급 본인확인 토큰 검증 후에만 허용.
  if (!DEMO_MODE) {
    return NextResponse.json({ ok: false, error: "본인확인을 거친 뒤 이용할 수 있습니다.", code: "AUTH_REQUIRED" }, { status: 403 });
  }
  const ip = clientIp(req);
  const rl = rateLimit(`cert-submit:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const name = String(body?.name || "").trim();
  const birth = cleanBirth(body?.birth);
  const providerCode = String(body?.providerCode || "").trim();
  if (!name || birth.length !== 6) {
    return NextResponse.json({ ok: false, error: "name·birth 필요" }, { status: 400 });
  }

  // providerCode 없으면 직접 전달용(콘솔 귀속 없음)
  let provider = { code: "", company: "직접 전달", service: "", vertical: body.vertical || "rent" };
  if (providerCode) {
    provider = await resolveProvider(providerCode);
    if (!provider) return NextResponse.json({ ok: false, error: "상대 코드를 확인할 수 없습니다." }, { status: 404 });
  }

  try {
    const draft = await buildCertificateDraft({
      name,
      birth,
      vertical: body.vertical || provider.vertical || "rent",
      method: body.method || "",
    });
    const result = await submitCertificate({
      draft,
      provider,
      subject: {
        name,
        birth,
        phone: body.phone || "",
        method: body.method || "",
        userId: resolveSubjectUserId(body),
      },
      signed: !!body.signed,
    });
    return NextResponse.json({ ok: true, id: result.id, cert: result.cert });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "제출 실패" }, { status: 500 });
  }
}
