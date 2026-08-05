import { NextResponse } from "next/server";
import { AGREEMENT_KINDS, normalizeAgreementKind } from "@/lib/contracts";
import { listResolvableContracts, resolveContractTemplate } from "@/lib/server/contracts";
import { DEFAULT_VERTICAL } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/contracts
 *  ?vertical=rent&code=1001              → 선택 가능한 템플릿 목록
 *  ?agreement=e_contract&contract=tpl_…  → 단일 해석
 *  ?agreement=platform_consent           → kind만 (기본 동의, template null)
 */
export async function GET(req) {
  try {
    const sp = req.nextUrl.searchParams;
    const vertical = sp.get("vertical") || DEFAULT_VERTICAL;
    const code = (sp.get("code") || "").replace(/\D/g, "");
    const contractId = sp.get("contract") || "";
    const agreement = normalizeAgreementKind(
      sp.get("agreement") || AGREEMENT_KINDS.PLATFORM_CONSENT
    );

    if (sp.has("agreement") || contractId) {
      const resolved = resolveContractTemplate({
        agreementKind: agreement,
        contractId,
        vertical,
        code,
      });
      if (resolved.error === "CONTRACT_NOT_FOUND") {
        return NextResponse.json({ ok: false, error: "계약서를 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        agreementKind: resolved.kind,
        template: resolved.template,
      });
    }

    const templates = listResolvableContracts({ vertical, code });
    return NextResponse.json({
      ok: true,
      agreementKinds: [
        { id: AGREEMENT_KINDS.PLATFORM_CONSENT, label: "착한거래 동의" },
        { id: AGREEMENT_KINDS.E_CONTRACT, label: "전자계약 (읽고 동의)" },
      ],
      templates,
    });
  } catch (e) {
    console.error("GET /api/v1/contracts", e);
    return NextResponse.json({ ok: false, error: "계약서 조회에 실패했습니다." }, { status: 500 });
  }
}
