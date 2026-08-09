import { NextResponse } from "next/server";
import { resolveActor, requireActor } from "@/lib/server/session";
import {
  getContractInstance,
  markIdentityVerifiedByStaff,
  recordHandover,
  requestSupplement,
} from "@/lib/server/contractInstances";
import { HANDOVER_FIELDS, effectiveHandover, isPendingHandover } from "@/lib/server/vehicleHandover";
import { readAsDataUrl } from "@/lib/server/blobStore";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { writeAudit } from "@/lib/server/audit";

export const runtime = "nodejs";
export const preferredRegion = "icn1";
export const maxDuration = 60;

/**
 * 계약 하나를 담당자가 «확인»하는 화면의 뒷단.
 *
 * 공급사가 아직 시스템을 직접 못 쓰므로 발급·확인을 관리자가 대신한다.
 * 여기서 신분증·얼굴을 나란히 보고 계약서의 이름·생년과 맞는지 판단한다.
 *
 * ⚠ 이 응답에는 손님의 얼굴·신분증이 들어간다. 관리자만, 매번 새로, 캐시 없이 나간다.
 */

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

async function actorOf(req) {
  const actor = requireActor(await resolveActor(req), { roles: ["admin"] });
  return actor?.email || actor?.userId || "admin";
}

export async function GET(req, { params }) {
  const ip = clientIp(req);
  if (!rateLimit(`admin-contract:${ip}`, { limit: 120, windowMs: 60_000 }).ok) {
    return json({ ok: false, error: "요청이 너무 많습니다." }, 429);
  }

  const contractId = String(params?.contractId || "").trim();
  try {
    const staff = await actorOf(req);
    const inst = await getContractInstance(contractId);
    if (!inst) return json({ ok: false, error: "계약을 찾을 수 없습니다." }, 404);

    // 이미지는 링크를 만들지 않고 바이트를 실어 보낸다 — 링크가 생기면 그걸 아는 누구나 본다.
    const [idCard, selfie, signature] = await Promise.all([
      readAsDataUrl(inst.identity?.idCardPath, "image/jpeg"),
      readAsDataUrl(inst.identity?.selfiePath, "image/jpeg"),
      readAsDataUrl(inst.signaturePath, "image/png"),
    ]);
    const docs = await Promise.all(
      (inst.documents || []).map(async (d) => ({
        key: d.key,
        label: (inst.requiredDocs || []).find((r) => r.key === d.key)?.label || d.key,
        submittedAt: d.submittedAt || null,
        image: await readAsDataUrl(d.storagePath, "image/jpeg"),
      })),
    );

    // 누가 남의 신분증을 열어 봤는지도 남는다. 열람 자체가 개인정보 처리다.
    await writeAudit({
      action: "admin_contract_open",
      actor: staff,
      meta: { contractId, externalRef: inst.externalRef || "", ip },
    });

    return json({
      ok: true,
      contract: {
        contractId: inst.contractId,
        memberCompany: inst.memberCompany || "",
        externalRef: inst.externalRef || "",
        templateId: inst.templateId || "",
        status: inst.status || "issued",
        signer: inst.signer || {},
        issuedAt: inst.issuedAt || null,
        openedAt: inst.openedAt || null,
        signedAt: inst.signedAt || null,
        expiresAt: inst.expiresAt || null,
        sealHash: inst.sealHash || "",
        verifyNo: inst.verifyNo || "",
        identity: {
          method: inst.identity?.method || "",
          verifiedAt: inst.identity?.verifiedAt || null,
          staffVerifiedAt: inst.identity?.staffVerifiedAt || null,
          staffVerifiedBy: inst.identity?.staffVerifiedBy || "",
          staffNote: inst.identity?.staffNote || "",
          idCard,
          selfie,
        },
        // 손님이 화면에서 채운 값 — 계약서와 대조할 것들(주소·계좌 등).
        inputs: inst.inputs || {},
        inputGroups: inst.inputGroups || [],
        acks: inst.acks || {},
        consentAtoms: (inst.consentAtoms || []).map((c) => ({ key: c.key, title: c.title || c.label || c.key })),
        documents: docs,
        requiredDocs: inst.requiredDocs || [],
        supplements: inst.supplements || [],
        signature,
        // 신차는 계약 시점에 차량번호·차대번호가 없다 — 인도 시점에 여기서 채운다.
        handover: {
          fields: HANDOVER_FIELDS,
          pending: isPendingHandover(inst),
          current: effectiveHandover(inst),
          history: (inst.handovers || []).map((h) => ({
            recordedAt: h.recordedAt, staff: h.staff, hash: h.hash, fields: h.fields,
          })),
        },
      },
    });
  } catch (e) {
    return json({ ok: false, error: e?.message || "실패", code: e?.code }, e?.status || 500);
  }
}

/** action: verify_identity | request_supplement */
export async function POST(req, { params }) {
  const ip = clientIp(req);
  if (!rateLimit(`admin-contract-post:${ip}`, { limit: 60, windowMs: 60_000 }).ok) {
    return json({ ok: false, error: "요청이 너무 많습니다." }, 429);
  }

  const contractId = String(params?.contractId || "").trim();
  const body = await req.json().catch(() => ({}));

  try {
    const staff = await actorOf(req);
    const action = String(body?.action || "").trim();

    if (action === "verify_identity") {
      const inst = await markIdentityVerifiedByStaff(contractId, { staff, note: body.note });
      if (!inst) return json({ ok: false, error: "계약을 찾을 수 없습니다." }, 404);
      await writeAudit({
        action: "identity_verified_by_staff",
        actor: staff,
        meta: {
          contractId,
          externalRef: inst.externalRef || "",
          signerName: inst.signer?.name || "",
          verifiedAt: inst.identity?.staffVerifiedAt,
          ip,
        },
      });
      return json({ ok: true, staffVerifiedAt: inst.identity?.staffVerifiedAt || null });
    }

    if (action === "record_handover") {
      const inst = await recordHandover(contractId, { values: body.values, staff });
      if (!inst) return json({ ok: false, error: "계약을 찾을 수 없습니다." }, 404);
      const last = inst.handovers[inst.handovers.length - 1];
      await writeAudit({
        action: "vehicle_handover_recorded",
        actor: staff,
        meta: {
          contractId,
          externalRef: inst.externalRef || "",
          // 무엇을 적었는지가 아니라 «어떤 상태를 적었는지»가 나중에 대조 기준이 된다.
          carNumber: last.fields.car_number || "",
          vin: last.fields.vin || "",
          handoverAt: last.fields.handover_datetime || "",
          hash: last.hash,
          ip,
        },
      });
      return json({ ok: true, handovers: inst.handovers });
    }

    if (action === "request_supplement") {
      const inst = await requestSupplement(contractId, {
        items: body.items,
        message: body.message,
        staff,
      });
      if (!inst) return json({ ok: false, error: "계약을 찾을 수 없습니다." }, 404);
      await writeAudit({
        action: "supplement_requested",
        actor: staff,
        meta: { contractId, items: body.items || [], ip },
      });
      return json({ ok: true, supplements: inst.supplements || [] });
    }

    return json({ ok: false, error: "알 수 없는 action" }, 400);
  } catch (e) {
    return json({ ok: false, error: e?.message || "실패", code: e?.code }, e?.status || 500);
  }
}
