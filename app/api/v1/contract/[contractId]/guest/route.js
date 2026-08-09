import { NextResponse } from "next/server";
import {
  getContractInstance,
  markOpened,
  toGuestView,
  isExpired,
  recordConsentStep,
  recordDocument,
  recordIdentityPhotos,
  recordInputs,
  recordAck,
  completeContractSign,
} from "@/lib/server/contractInstances";
import { requireVerifiedSubject } from "@/lib/server/authz";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { writeAudit } from "@/lib/server/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/v1/contract/{contractId}/guest
 * 손님용(추측 불가 contractId가 비밀). 첫 진입 시 status=opened.
 */
export async function GET(req, { params }) {
  const ip = clientIp(req);
  const rl = rateLimit(`contract-guest:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const contractId = String(params?.contractId || "").trim();
  if (!contractId) {
    return NextResponse.json({ ok: false, error: "contractId 필요" }, { status: 400 });
  }

  let inst = await getContractInstance(contractId);
  if (!inst) {
    return NextResponse.json({ ok: false, error: "계약을 찾을 수 없습니다." }, { status: 404 });
  }

  if (inst.status === "signed" || isExpired(inst)) {
    return NextResponse.json({
      ok: true,
      blocked: true,
      reason: inst.status === "signed" ? "signed" : "expired",
      view: toGuestView(inst),
    });
  }

  inst = await markOpened(contractId);
  return NextResponse.json({ ok: true, blocked: false, view: toGuestView(inst) });
}

/**
 * POST /api/v1/contract/{contractId}/guest
 * body.action: consent | document | identity | sign
 */
export async function POST(req, { params }) {
  const ip = clientIp(req);
  const rl = rateLimit(`contract-guest-post:${ip}`, { limit: 40, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const contractId = String(params?.contractId || "").trim();
  if (!contractId) {
    return NextResponse.json({ ok: false, error: "contractId 필요" }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  let subject;
  try {
    subject = await requireVerifiedSubject(req, body, { endpoint: `/api/v1/contract/${contractId}/guest` });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "본인확인 필요", code: e?.code },
      { status: e?.status || 401 },
    );
  }

  const inst0 = await getContractInstance(contractId);
  if (!inst0) {
    return NextResponse.json({ ok: false, error: "계약을 찾을 수 없습니다." }, { status: 404 });
  }
  if (inst0.status === "signed") {
    return NextResponse.json({ ok: false, error: "이미 서명된 계약입니다.", code: "ALREADY_SIGNED" }, { status: 409 });
  }
  if (isExpired(inst0)) {
    return NextResponse.json({ ok: false, error: "만료된 계약 링크입니다.", code: "EXPIRED" }, { status: 410 });
  }

  const action = String(body?.action || "").trim();

  try {
    let inst;
    if (action === "consent") {
      inst = await recordConsentStep(contractId, body.key);
    } else if (action === "document") {
      inst = await recordDocument(contractId, { key: body.key, dataUrl: body.dataUrl || body.image || "" });
    } else if (action === "identity") {
      inst = await recordIdentityPhotos(contractId, {
        idCardDataUrl: body.idImage || body.idCardDataUrl || "",
        selfieDataUrl: body.faceImage || body.selfieDataUrl || "",
        method: body.method || subject.method || "stub",
      });
    } else if (action === "input") {
      inst = await recordInputs(contractId, body.values || body.inputs);
    } else if (action === "ack") {
      inst = await recordAck(contractId, body.key, body.agreed);
    } else if (action === "sign") {
      const sig = body.signature || body.signatureDataUrl || "";
      inst = await completeContractSign(contractId, {
        signatureDataUrl: sig,
        subjectUserId: subject.userId,
        matchKey: subject.matchKey,
        ip,
      });
      await writeAudit({
        action: "contract_sign",
        actor: subject.userId,
        meta: {
          contractId,
          memberCompany: inst.memberCompany,
          externalRef: inst.externalRef,
          // 봉인 결과를 감사로그에도 남긴다 — 나중에 대조할 기준점.
          sealHash: inst.sealHash,
          verifyNo: inst.verifyNo,
          ip,
        },
      });
    } else {
      return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, view: toGuestView(inst) });
  } catch (e) {
    console.error("contract guest post", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "처리 실패", code: e?.code },
      { status: e?.status || 500 },
    );
  }
}
