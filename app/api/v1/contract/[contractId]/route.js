import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/server/apiKeys";
import {
  getContractInstance,
  toMemberStatus,
} from "@/lib/server/contractInstances";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

function requestOrigin(req) {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * GET /api/v1/contract/{contractId}
 * Authorization: ApiKey — 자기 회원사 인스턴스만.
 * 패널③ signUrl · 패널④ consents/documents/progress. 원본 이미지는 제외.
 */
export async function GET(req, { params }) {
  const ip = clientIp(req);
  const rl = rateLimit(`contract-get:${ip}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let auth;
  try {
    auth = await requireApiKey(req);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "인증 실패", code: e?.code },
      { status: e?.status || 401 },
    );
  }

  const contractId = String(params?.contractId || "").trim();
  if (!contractId) {
    return NextResponse.json({ ok: false, error: "contractId 필요" }, { status: 400 });
  }

  const inst = await getContractInstance(contractId);
  if (!inst || inst.memberCompany !== auth.memberCompany) {
    return NextResponse.json({ ok: false, error: "계약을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(toMemberStatus(inst, { origin: requestOrigin(req) }));
}
