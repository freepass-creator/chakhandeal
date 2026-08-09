import { NextResponse } from "next/server";
import { resolveActor, requireActor } from "@/lib/server/session";
import { listContractInstances } from "@/lib/server/contractInstances";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

/**
 * GET /api/v1/admin/contracts — 발급된 전자계약 목록(관리자).
 *
 * 공급사가 아직 시스템을 직접 못 쓰므로 **발급·확인을 관리자가 대신한다**(2026-08-09 확정).
 * 목록에는 사람이 판단할 최소치만 싣는다 — 이미지·주민번호는 상세에서만.
 */
export async function GET(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`admin-contracts:${ip}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });

  try {
    requireActor(await resolveActor(req), { roles: ["admin"] });
    const list = await listContractInstances();
    const rows = list.map((inst) => ({
      contractId: inst.contractId,
      memberCompany: inst.memberCompany || "",
      externalRef: inst.externalRef || "",
      signerName: inst.signer?.name || "",
      status: inst.status || "issued",
      issuedAt: inst.issuedAt || null,
      openedAt: inst.openedAt || null,
      signedAt: inst.signedAt || null,
      expiresAt: inst.expiresAt || null,
      // 사람이 봐야 할 것 — 「내가 확인해야 하나」
      identitySubmitted: !!(inst.identity?.idCardPath && inst.identity?.selfiePath),
      identityVerifiedByStaff: !!inst.identity?.staffVerifiedAt,
      docsSubmitted: (inst.documents || []).filter((d) => d.submittedAt).length,
      docsRequired: (inst.requiredDocs || []).filter((d) => d.required).length,
      sealHash: inst.sealHash || "",
      verifyNo: inst.verifyNo || "",
    }));
    // 손볼 게 남은 것부터 — 서명됐는데 담당자 확인이 안 된 계약이 맨 위로.
    rows.sort((a, b) => {
      const pa = a.signedAt && !a.identityVerifiedByStaff ? 0 : 1;
      const pb = b.signedAt && !b.identityVerifiedByStaff ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (b.issuedAt || 0) - (a.issuedAt || 0);
    });
    return NextResponse.json({ ok: true, contracts: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "실패" }, { status: e?.status || 500 });
  }
}
