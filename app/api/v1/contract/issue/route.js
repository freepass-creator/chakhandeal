import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/server/apiKeys";
import {
  issueContractInstance,
  buildSignUrl,
} from "@/lib/server/contractInstances";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { writeAudit } from "@/lib/server/audit";

export const runtime = "nodejs";

function requestOrigin(req) {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * POST /api/v1/contract/issue
 * Authorization: ApiKey <key>
 * Idempotency: externalRef (memberCompany 스코프) — 같은 ref면 기존 contractId 반환
 */
export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`contract-issue:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let auth;
  try {
    auth = await requireApiKey(req);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "인증 실패", code: e?.code || "API_KEY_REQUIRED" },
      { status: e?.status || 401 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  try {
    const origin = requestOrigin(req);
    const { instance, created } = await issueContractInstance(body, {
      memberCompany: auth.memberCompany,
      origin,
    });
    await writeAudit({
      action: "contract_issue",
      actor: `apikey:${auth.memberCompany}`,
      meta: {
        contractId: instance.contractId,
        externalRef: instance.externalRef,
        created,
        idempotencyKey: req.headers.get("idempotency-key") || "",
      },
    });
    return NextResponse.json({
      contractId: instance.contractId,
      signUrl: buildSignUrl(origin, instance.contractId),
      expiresAt: instance.expiresAt,
      verifyUrl: instance.verifyUrl || "",
      sealHash: instance.sealHash || "",
    });
  } catch (e) {
    console.error("contract/issue", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "발행 실패", code: e?.code },
      { status: e?.status || 500 },
    );
  }
}
