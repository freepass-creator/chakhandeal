import { NextResponse } from "next/server";
import { checkRiskByKey, filterRecordsByVertical } from "@/lib/server/risks";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { requireVerifiedSubject } from "@/lib/server/authz";

export const runtime = "nodejs";

/**
 * POST /api/v1/check — 본인 이력 자기조회(토큰-only).
 * name+birth 임의조회 폐지. 토큰.matchKey로 "내 상태"만.
 * body: { identityToken?, vertical? }
 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`check:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let body = {};
  try { body = await req.json(); } catch { body = {}; }

  let subject;
  try {
    subject = await requireVerifiedSubject(req, body, { endpoint: "/api/v1/check" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "본인확인 필요", code: e?.code || "AUTH_REQUIRED" },
      { status: e?.status || 401 },
    );
  }

  try {
    const result = await checkRiskByKey(subject.matchKey, { actor: `self:${subject.userId}` });
    const vertical = body.vertical || "";
    const records = vertical
      ? filterRecordsByVertical(result.records, vertical)
      : result.records;
    const types = [...new Set(records.map((r) => r.type).filter(Boolean))];
    return NextResponse.json({
      ok: true,
      exists: records.length > 0,
      types,
      ambiguous: records.length >= 2 && types.length >= 2,
      kind: records.length === 0 ? "none" : (records.length >= 2 && types.length >= 2 ? "ambiguous" : "hit"),
      records,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "조회 실패" }, { status: 500 });
  }
}
