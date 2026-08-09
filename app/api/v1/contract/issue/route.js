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
      /*
       * 운영 결정(2026-08-09): 현재 전자계약은 «링크 발급·관리자 직접 전달» 방식이다.
       * 착한거래는 SMS/카카오를 발송하지 않으며 `/contract/{id}/send` API도 제공하지 않는다.
       * 연동 ERP는 이 signUrl을 저장한 뒤 관리자 화면에서 복사할 수 있게 해야 한다.
       * verifyUrl은 서명 완료 후 봉인 결과를 확인하는 주소이므로 서명 링크로 쓰지 않는다.
       */
      // 손님에게 나가는 링크는 «회원사 도메인» 우선. 처음 보는 도메인이면 피싱으로 읽힌다.
      signUrl: buildSignUrl(origin, instance.contractId, instance.memberCompany),
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
