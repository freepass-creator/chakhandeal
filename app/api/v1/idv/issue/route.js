import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { issueIdentityToken } from "@/lib/server/identityToken";
import { DEMO_USER_IDS } from "@/lib/server/ids";
import { DEMO_USERS } from "@/lib/demo";
import { cleanBirth } from "@/lib/format";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

/** 데모 샘플 인물 → 시드 userId. 실 IdV 도입 시 phone_lookup_token dedup으로 교체(TODO). */
function resolveUserId({ name, birth }) {
  const n = String(name || "").trim();
  const b = cleanBirth(birth);
  for (const [key, u] of Object.entries(DEMO_USERS)) {
    if (u.name === n && cleanBirth(u.birth) === b) {
      return u.userId || DEMO_USER_IDS[key] || randomUUID();
    }
  }
  return randomUUID();
}

/**
 * POST /api/v1/idv/issue — 본인확인 토큰 발급(스텁).
 * AuthFlow onVerified 시점에 호출. 실 PASS 연동 시 이 라우트 내부만 교체.
 * Phase 1: 발급만 — 본인 경로에서 토큰 강제는 Phase 2.
 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`idv-issue:${ip}`, { limit: 40, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const name = String(body?.name || "").trim();
  const birth = cleanBirth(body?.birth);
  const phone = String(body?.phone || "").trim();
  const method = String(body?.method || "unknown");
  if (!name || birth.length !== 6) {
    return NextResponse.json({ ok: false, error: "name·birth 필요" }, { status: 400 });
  }

  const userId = resolveUserId({ name, birth });
  try {
    const token = issueIdentityToken({ userId, name, birth, phone, method });
    return NextResponse.json({ ok: true, token, userId });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "발급 실패" }, { status: e?.status || 500 });
  }
}
