/**
 * 전자계약 스캐폴드 — 클라이언트·서버 공용 상수/헬퍼
 *
 * 기본 경로: 착한거래 동의(platform_consent)
 * 전자계약(e_contract): 업종 템플릿 또는 커스텀 계약서를 읽고 동의한 뒤에만 진행
 *
 * 틀만 — 외부 전자서명 벤더·PDF·법적 효력 검증은 이후 Phase.
 */
import { DEFAULT_VERTICAL, VERTICALS } from "./constants";

/** 동의/계약 모드 */
export const AGREEMENT_KINDS = {
  /** 기본 — 착한거래 개인정보 제3자 제공 동의 */
  PLATFORM_CONSENT: "platform_consent",
  /** 전자계약 — 계약서 열람 후 동의 */
  E_CONTRACT: "e_contract",
};

/** 계약서 출처 */
export const CONTRACT_SOURCES = {
  VERTICAL: "vertical",
  CUSTOM: "custom",
};

export const AGREEMENT_KIND_LABELS = {
  [AGREEMENT_KINDS.PLATFORM_CONSENT]: "착한거래 동의",
  [AGREEMENT_KINDS.E_CONTRACT]: "전자계약",
};

/**
 * 업종별 기본 전자계약 템플릿 (플레이스홀더 본문)
 * 실제 법률 검토·회원사 커스텀은 이후. 여기서는 읽고 동의 게이트용 틀.
 */
export const VERTICAL_CONTRACT_TEMPLATES = {
  rent: {
    id: "tpl_rent_rental_v1",
    kind: AGREEMENT_KINDS.E_CONTRACT,
    source: CONTRACT_SOURCES.VERTICAL,
    vertical: "rent",
    title: "렌탈 이용 계약서",
    version: "v0.1-scaffold",
    requireReadThrough: true,
    summary: "대여 조건·반납·요금·파손 책임에 관한 기본 계약(틀).",
    sections: [
      {
        t: "제1조 (목적)",
        b: "본 계약은 대여인(회원사)과 차주인 사이의 물품·자산 대여에 관한 권리·의무를 정합니다. (스캐폴드 문구)",
      },
      {
        t: "제2조 (대여 대상·기간)",
        b: "대여 대상, 대여 시작·종료 시점, 연장 조건은 회원사가 안내한 거래 조건에 따릅니다.",
      },
      {
        t: "제3조 (요금·보증)",
        b: "대여료·보증금·연체료 등 요금은 사전 고지된 요율에 따르며, 미납 시 합의된 절차에 따라 처리됩니다.",
      },
      {
        t: "제4조 (이용·반납)",
        b: "차주는 통상적인 주의로 이용하고, 약정 기한 내 원상으로 반납합니다. 파손·분실 시 사실 확인 후 정산합니다.",
      },
      {
        t: "제5조 (착한거래 연동)",
        b: "본 계약 동의와 별도로, 「착한거래」 개인정보 제3자 제공 동의 및 상태 검증 전달이 함께 진행될 수 있습니다.",
      },
    ],
  },
  pet: {
    id: "tpl_pet_adoption_v1",
    kind: AGREEMENT_KINDS.E_CONTRACT,
    source: CONTRACT_SOURCES.VERTICAL,
    vertical: "pet",
    title: "책임입양 계약서",
    version: "v0.1-scaffold",
    requireReadThrough: true,
    summary: "입양 조건·근황·반환·동물등록에 관한 기본 계약(틀).",
    sections: [
      {
        t: "제1조 (목적)",
        b: "본 계약은 분양자·구조단체와 입양 희망자 사이의 책임 있는 입양에 관한 합의를 정합니다. (스캐폴드 문구)",
      },
      {
        t: "제2조 (입양 대상)",
        b: "입양 동물, 인도 일시·장소, 초기 건강·접종 안내는 분양 측이 고지한 내용에 따릅니다.",
      },
      {
        t: "제3조 (사후 관리)",
        b: "입양자는 합의된 주기·방식으로 근황을 제출하고, 동물등록 등 법령상 의무를 이행합니다.",
      },
      {
        t: "제4조 (반환·중대 위반)",
        b: "양육 불가 시 합의된 반환 절차를 따르며, 유기·학대 등 중대 위반은 객관적 확인 후 기록될 수 있습니다.",
      },
      {
        t: "제5조 (착한거래 연동)",
        b: "본 계약 동의와 별도로, 「착한거래」 개인정보 제3자 제공 동의 및 상태 검증 전달이 함께 진행될 수 있습니다.",
      },
    ],
  },
  dine: {
    id: "tpl_dine_reservation_v1",
    kind: AGREEMENT_KINDS.E_CONTRACT,
    source: CONTRACT_SOURCES.VERTICAL,
    vertical: "dine",
    title: "예약·이용 약정서",
    version: "v0.1-scaffold",
    requireReadThrough: true,
    summary: "예약 시각·취소·노쇼·매장 이용에 관한 기본 약정(틀).",
    sections: [
      {
        t: "제1조 (목적)",
        b: "본 약정은 식당과 예약자 사이의 예약 이행에 관한 기본 조건을 정합니다. (스캐폴드 문구)",
      },
      {
        t: "제2조 (예약·변경)",
        b: "예약 인원·시각·코스는 확정된 안내에 따르며, 변경·취소는 매장 정책에 따릅니다.",
      },
      {
        t: "제3조 (노쇼)",
        b: "사전 연락 없이 미방문하는 경우 매장 정책 및 플랫폼 기록 규칙이 적용될 수 있습니다.",
      },
      {
        t: "제4조 (착한거래 연동)",
        b: "본 약정 동의와 별도로, 「착한거래」 개인정보 제3자 제공 동의 및 상태 검증 전달이 함께 진행될 수 있습니다.",
      },
    ],
  },
  stay: {
    id: "tpl_stay_lodging_v1",
    kind: AGREEMENT_KINDS.E_CONTRACT,
    source: CONTRACT_SOURCES.VERTICAL,
    vertical: "stay",
    title: "숙박 이용 약정서",
    version: "v0.1-scaffold",
    requireReadThrough: true,
    summary: "체크인·이용수칙·파손·노쇼에 관한 기본 약정(틀).",
    sections: [
      {
        t: "제1조 (목적)",
        b: "본 약정은 숙소와 투숙객 사이의 숙박 이용에 관한 기본 조건을 정합니다. (스캐폴드 문구)",
      },
      {
        t: "제2조 (체크인·이용)",
        b: "체크인·체크아웃 시각과 시설 이용수칙은 숙소가 고지한 내용에 따릅니다.",
      },
      {
        t: "제3조 (파손·위반)",
        b: "시설 파손·중대 수칙 위반이 객관적으로 확인되면 합의된 정산·기록 절차가 적용될 수 있습니다.",
      },
      {
        t: "제4조 (착한거래 연동)",
        b: "본 약정 동의와 별도로, 「착한거래」 개인정보 제3자 제공 동의 및 상태 검증 전달이 함께 진행될 수 있습니다.",
      },
    ],
  },
};

/** 데모용 커스텀 계약서 예시 (회원사 커스터마이징 자리) */
export const DEMO_CUSTOM_CONTRACTS = [
  {
    id: "tpl_custom_demo_rent_v1",
    kind: AGREEMENT_KINDS.E_CONTRACT,
    source: CONTRACT_SOURCES.CUSTOM,
    vertical: "rent",
    companyCode: "1001",
    company: "테스트렌탈",
    title: "테스트렌탈 맞춤 대여계약서",
    version: "v0.1-scaffold",
    requireReadThrough: true,
    summary: "회원사가 조항·문구를 바꾼 커스텀 계약(틀).",
    sections: [
      {
        t: "맞춤 조항 1 (대여 품목)",
        b: "본 계약의 대여 품목·부속품 목록은 테스트렌탈이 별도 고지한 명세에 따릅니다. (커스텀 스캐폴드)",
      },
      {
        t: "맞춤 조항 2 (특별 약정)",
        b: "주말 연장 요금, 차량 주행거리 한도 등 회원사 고유 약정은 안내문에 명시된 대로입니다.",
      },
      {
        t: "공통 (착한거래)",
        b: "전자계약 동의와 함께 「착한거래」 동의·상태 검증이 같은 흐름에서 처리됩니다.",
      },
    ],
  },
  {
    id: "tpl_custom_demo_pet_v1",
    kind: AGREEMENT_KINDS.E_CONTRACT,
    source: CONTRACT_SOURCES.CUSTOM,
    vertical: "pet",
    companyCode: "2001",
    company: "해피펫분양",
    title: "해피펫 맞춤 입양계약서",
    version: "v0.1-scaffold",
    requireReadThrough: true,
    summary: "분양사가 근황 주기·반환 조건을 명시한 커스텀 계약(틀).",
    sections: [
      {
        t: "맞춤 조항 1 (근황)",
        b: "입양 후 1·3·6개월 차 사진·간단 근황을 제출합니다. (커스텀 스캐폴드)",
      },
      {
        t: "맞춤 조항 2 (중성화·등록)",
        b: "합의된 기한 내 중성화·동물등록을 완료하고 증빙을 제출합니다.",
      },
      {
        t: "공통 (착한거래)",
        b: "전자계약 동의와 함께 「착한거래」 동의·상태 검증이 같은 흐름에서 처리됩니다.",
      },
    ],
  },
];

export function isAgreementKind(v) {
  return v === AGREEMENT_KINDS.PLATFORM_CONSENT || v === AGREEMENT_KINDS.E_CONTRACT;
}

export function normalizeAgreementKind(v) {
  return isAgreementKind(v) ? v : AGREEMENT_KINDS.PLATFORM_CONSENT;
}

/** 업종 기본 전자계약 템플릿 */
export function getVerticalContractTemplate(verticalId = DEFAULT_VERTICAL) {
  const id = VERTICALS[verticalId] ? verticalId : DEFAULT_VERTICAL;
  return VERTICAL_CONTRACT_TEMPLATES[id] || VERTICAL_CONTRACT_TEMPLATES[DEFAULT_VERTICAL];
}

/** id로 빌트인(업종·데모 커스텀) 템플릿 조회 */
export function findBuiltinContractTemplate(templateId) {
  if (!templateId) return null;
  for (const t of Object.values(VERTICAL_CONTRACT_TEMPLATES)) {
    if (t.id === templateId) return t;
  }
  return DEMO_CUSTOM_CONTRACTS.find((t) => t.id === templateId) || null;
}

/** 업종(+선택 코드)에 쓸 수 있는 템플릿 목록 — 업종 기본 + 해당 코드 커스텀 */
export function listContractTemplatesFor({ vertical = DEFAULT_VERTICAL, code = "" } = {}) {
  const v = VERTICALS[vertical] ? vertical : DEFAULT_VERTICAL;
  const verticalTpl = getVerticalContractTemplate(v);
  const customs = DEMO_CUSTOM_CONTRACTS.filter(
    (t) => t.vertical === v && (!code || t.companyCode === code)
  );
  return [verticalTpl, ...customs];
}

/** 공개용으로 최소 필드만 */
export function publicContractTemplate(t) {
  if (!t) return null;
  return {
    id: t.id,
    kind: t.kind || AGREEMENT_KINDS.E_CONTRACT,
    source: t.source,
    vertical: t.vertical,
    title: t.title,
    version: t.version,
    requireReadThrough: t.requireReadThrough !== false,
    summary: t.summary || "",
    sections: Array.isArray(t.sections) ? t.sections : [],
    companyCode: t.companyCode || "",
    company: t.company || "",
  };
}

/**
 * 동의 링크 쿼리 조립
 * 기본: /consent?code= — 착한거래 동의만
 * 전자계약: agreement=e_contract&contract=<templateId>
 */
export function buildConsentLink({ origin = "", code = "", agreementKind = AGREEMENT_KINDS.PLATFORM_CONSENT, contractId = "" } = {}) {
  const base = origin ? `${origin.replace(/\/$/, "")}/consent` : "/consent";
  const q = new URLSearchParams();
  if (code) q.set("code", code);
  const kind = normalizeAgreementKind(agreementKind);
  if (kind === AGREEMENT_KINDS.E_CONTRACT) {
    q.set("agreement", AGREEMENT_KINDS.E_CONTRACT);
    if (contractId) q.set("contract", contractId);
  }
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}
