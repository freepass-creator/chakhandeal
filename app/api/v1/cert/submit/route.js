import { NextResponse } from "next/server";
import { buildCertificateDraft, submitCertificate } from "@/lib/server/certificate";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { getAdmin } from "@/lib/server/admin";
import { mockFindMemberByCode } from "@/lib/server/mockStore";
import { DEMO_MEMBERS } from "@/lib/constants";
import { requireVerifiedSubject } from "@/lib/server/authz";
import { cleanBirth } from "@/lib/format";

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

/**
 * POST /api/v1/cert/submit — 토큰-only.
 * subject 신원은 오직 본인확인 토큰. body.subjectUserId/userId 폴백 삭제.
 * name/phone은 표시용 저장만(조회키로 쓰지 않음).
 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`cert-submit:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  let subject;
  try {
    subject = await requireVerifiedSubject(req, body, { endpoint: "/api/v1/cert/submit" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "본인확인 필요", code: e?.code || "AUTH_REQUIRED" },
      { status: e?.status || 401 },
    );
  }

  const name = String(body?.name || "").trim();
  const birth = cleanBirth(body?.birth);
  const providerCode = String(body?.providerCode || "").trim();

  let provider = { code: "", company: "직접 전달", service: "", vertical: body.vertical || "rent" };
  if (providerCode) {
    provider = await resolveProvider(providerCode);
    if (!provider) return NextResponse.json({ ok: false, error: "상대 코드를 확인할 수 없습니다." }, { status: 404 });
  }

  try {
    const draft = await buildCertificateDraft({
      matchKey: subject.matchKey,
      vertical: body.vertical || provider.vertical || "rent",
      method: body.method || subject.method || "",
    });
    const result = await submitCertificate({
      draft,
      provider,
        subject: {
        name,
        birth,
        phone: body.phone || "",
        method: body.method || subject.method || "",
        userId: subject.userId,
        matchKey: subject.matchKey,
      },
      signed: !!body.signed,
    });
    return NextResponse.json({ ok: true, id: result.id, cert: result.cert });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "제출 실패" }, { status: e?.status || 500 });
  }
}
