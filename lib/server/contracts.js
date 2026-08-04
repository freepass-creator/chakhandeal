/**
 * 전자계약 템플릿 해석 (스캐폴드)
 * — 업종 기본 + 데모 커스텀 + mock 저장소 커스텀
 */
import {
  AGREEMENT_KINDS,
  DEMO_CUSTOM_CONTRACTS,
  findBuiltinContractTemplate,
  getVerticalContractTemplate,
  listContractTemplatesFor,
  normalizeAgreementKind,
  publicContractTemplate,
} from "@/lib/contracts";
import { DEFAULT_VERTICAL } from "@/lib/constants";

function store() {
  if (!globalThis.__rsProStore) globalThis.__rsProStore = {};
  const s = globalThis.__rsProStore;
  if (!(s.customContracts instanceof Map)) {
    s.customContracts = new Map();
    for (const t of DEMO_CUSTOM_CONTRACTS) {
      s.customContracts.set(t.id, { ...t });
    }
  }
  return s;
}

export function mockListCustomContracts({ vertical = "", code = "" } = {}) {
  const all = [...store().customContracts.values()];
  return all.filter((t) => {
    if (vertical && t.vertical !== vertical) return false;
    if (code && t.companyCode && t.companyCode !== code) return false;
    return true;
  });
}

export function mockUpsertCustomContract(tpl) {
  if (!tpl?.id) throw new Error("contract id required");
  store().customContracts.set(tpl.id, { ...tpl, source: "custom", kind: AGREEMENT_KINDS.E_CONTRACT });
  return store().customContracts.get(tpl.id);
}

export function mockGetCustomContract(id) {
  return store().customContracts.get(id) || null;
}

/**
 * 템플릿 1건 해석
 * 우선순위: 명시 id → (전자계약이면) 업종 기본 → null
 */
export function resolveContractTemplate({
  agreementKind = AGREEMENT_KINDS.PLATFORM_CONSENT,
  contractId = "",
  vertical = DEFAULT_VERTICAL,
  code = "",
} = {}) {
  const kind = normalizeAgreementKind(agreementKind);
  if (kind !== AGREEMENT_KINDS.E_CONTRACT) {
    return { kind, template: null };
  }

  if (contractId) {
    const custom = mockGetCustomContract(contractId);
    if (custom) return { kind, template: publicContractTemplate(custom) };
    const builtin = findBuiltinContractTemplate(contractId);
    if (builtin) return { kind, template: publicContractTemplate(builtin) };
    return { kind, template: null, error: "CONTRACT_NOT_FOUND" };
  }

  // id 없으면 해당 코드 커스텀 우선, 없으면 업종 기본
  const customs = mockListCustomContracts({ vertical, code });
  if (code && customs.length) {
    return { kind, template: publicContractTemplate(customs[0]) };
  }
  return { kind, template: publicContractTemplate(getVerticalContractTemplate(vertical)) };
}

/** 업종·코드 기준 선택 가능한 템플릿 목록 */
export function listResolvableContracts({ vertical = DEFAULT_VERTICAL, code = "" } = {}) {
  const builtins = listContractTemplatesFor({ vertical, code }).map(publicContractTemplate);
  const extras = mockListCustomContracts({ vertical, code })
    .filter((t) => !builtins.some((b) => b.id === t.id))
    .map(publicContractTemplate);
  return [...builtins, ...extras];
}
