import { NextResponse } from "next/server";
import { buildCertificateDraft, submitCertificate } from "@/lib/server/certificate";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { cleanBirth } from "@/lib/format";
import { getAdmin } from "@/lib/server/admin";
import { mockFindMemberByCode } from "@/lib/server/mockStore";
import { DEMO_MEMBERS } from "@/lib/constants";

export const runtime = "nodejs";

async function resolveProvider(code) {
  const c = (code || "").trim();
  const d = DEMO_MEMBERS.find((x) => x.code === c);
  if (d) return d;
  const m = mockFindMemberByCode(c);
  if (m) return { code: c, company: m.company, service: m.service || "", vertical: m.vertical };
  const { ready, db } = getAdmin();
  if (!ready) return null;
  const snap = await db.collection("members").where("code", "==", c).where("status", "==", "approved").limit(1).get();
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return { code: c, company: data.company, service: data.service || "", vertical: data.vertical };
}

/**
 * POST /api/v1/cert/submit
 * body: { name, birth, phone?, method?, vertical, providerCode, signed? }
 */
export async function POST(req) {
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
      subject: { name, birth, phone: body.phone || "", method: body.method || "" },
      signed: !!body.signed,
    });
    return NextResponse.json({ ok: true, id: result.id, cert: result.cert });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "제출 실패" }, { status: 500 });
  }
}
