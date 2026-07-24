import { NextResponse } from "next/server";
import { checkRisk } from "@/lib/server/risks";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { cleanBirth } from "@/lib/format";

export const runtime = "nodejs";

function publicCheckAllowed() {
  // 운영 기본 차단. 로컬 데모만 ALLOW_PUBLIC_CHECK=1 또는 개발 환경에서 허용.
  if (process.env.ALLOW_PUBLIC_CHECK === "1") return true;
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

/**
 * POST /api/v1/check
 * 본인 이력 열람용(레거시). 사업자·제3자 검색 API가 아님.
 * 운영에서는 기본 비활성 — 검증 링크 모델을 쓰세요.
 * body: { name, birth }
 */
export async function POST(req) {
  if (!publicCheckAllowed()) {
    return NextResponse.json(
      {
        ok: false,
        error: "공개 이름·생년월일 조회는 제공하지 않습니다. 검증 링크로 전달하세요.",
        code: "CHECK_DISABLED",
      },
      { status: 403 },
    );
  }

  const ip = clientIp(req);
  const rl = rateLimit(`check:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const name = String(body?.name || "").trim();
  const birth = cleanBirth(body?.birth);
  if (!name || birth.length !== 6) {
    return NextResponse.json({ ok: false, error: "이름·생년월일(6자리)이 필요합니다." }, { status: 400 });
  }

  try {
    const result = await checkRisk({ name, birth, actor: `self:${ip}` });
    return NextResponse.json({
      ok: true,
      exists: result.exists,
      types: result.types,
      ambiguous: result.ambiguous,
      kind: result.kind,
      records: result.records,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "조회 실패" }, { status: 500 });
  }
}
