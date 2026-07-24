// 공용 상수/문구 — 한 곳에서 관리 (규격 통일)

// 데모 모드 — 배포(실서비스) 시 false 한 줄로 데모 UI·샘플 통과 전체 제거
export const DEMO_MODE = true;

// 오픈 전 인트로 — 더 이상 쓰지 않음. 인트로는 첫 방문 1회만(확인 시 localStorage).
export const PRE_LAUNCH_INTRO = false;

// 브랜드/서비스 명칭 — 「착한거래」(마스터) + 버티컬(RentSure / PetSure / DineSure 후보)
export const BRAND_NAME = "착한거래";
export const BRAND_EN = "SurePlatform"; // 영문 상위 브랜드 미정 — 플레이스홀더
export const SERVICE_NAME = "렌탈";
export const SERVICE_TAG = "렌탈 서비스";
export const CODE_LABEL = "거래코드";
export const VIOLATION_LABEL = "거래 위반";

/** 활성 기본 버티컬 (콘솔 기본값). 회원 프로필 vertical 이 있으면 그쪽 우선 */
export const DEFAULT_VERTICAL = "rent";

/** 메인으로 함께 운영하는 버티컬 (랜딩·데모 진입) */
export const PRIMARY_VERTICALS = ["pet", "rent"];

/** 데모용 사업자 코드 (서버 조회 실패 시 폴백) */
export const DEMO_PROVIDER_CODES = {
  pet: [
    { code: "2001", company: "해피펫분양", service: "반려 분양" },
    { code: "2002", company: "따뜻한구조", service: "구조·입양" },
  ],
  rent: [
    { code: "1001", company: "테스트렌탈", service: "렌탈" },
    { code: "1002", company: "안전렌탈", service: "렌탈" },
  ],
};

/**
 * 업종별 정의 — 공통 모델: 자기정보 증명 (검색·블랙리스트 금지)
 * rent → RentSure(렌탈), pet → PetSure, dine → DineSure, stay → StaySure(가칭)
 * @see docs/platform-principles.md
 */
export const VERTICALS = {
  rent: {
    id: "rent",
    label: "렌탈",
    brandEn: "RentSure",
    brandKo: "렌탈슈어",
    tag: "렌탈 서비스",
    subjectLabel: "대여 손님",
    providerLabel: "렌탈 회원사",
    codeLabel: "렌탈 코드",
    certName: "렌탈 상태 검증",
    campaignTitle: "서로 믿고 빌리는 렌탈 문화를 위해",
    oneLiner: "내가 내 렌탈 상태를 확인하고, 상태 링크로 필요한 렌탈사에만 보여 줍니다.",
    signTitle: "렌탈 상태 확인에 서명해 주세요",
    extraAgree: "대여 조건·반납·정산을 성실히 이행하는 데 동의합니다.",
    sharePurpose: "렌탈 신청용",
    path: "/rent",
    verifyPath: "/v",
    riskTypes: {
      unpaid: "대여료 장기 미납(확정)",
      not_returned: "물품·자산 미반납(확정)",
      accident: "파손·사고비용 미정산(확정)",
      unauthorized: "무단 제3자 이용(확정)",
      disposal: "임의처분·담보 의심(확정)",
    },
  },
  pet: {
    id: "pet",
    label: "반려·분양",
    brandEn: "PetSure",
    brandKo: "팻슈어",
    tag: "책임입양 검증",
    subjectLabel: "입양 희망자",
    providerLabel: "분양자·구조단체",
    codeLabel: "분양 코드",
    certName: "책임입양 검증",
    campaignTitle: "책임 있는 입양을 위해",
    oneLiner: "책임 있는 입양을 위해 상태 링크로 내 상태를 직접 보여 줍니다.",
    signTitle: "책임입양 약속에 서명해 주세요",
    extraAgree: "입양 후 합의된 정기 근황 기록에 동의합니다.",
    sharePurpose: "입양 신청용",
    path: "/pet",
    verifyPath: "/v",
    riskTypes: {
      abandon: "유기·방치(확정)",
      unpaid_pet: "분양대금·관리비 미납(확정)",
      abuse: "학대(확정)",
      contract_break: "분양계약 중대 위반(확정)",
      update_miss: "합의 근황 미제출(확정)",
    },
  },
  dine: {
    id: "dine",
    label: "식당·예약",
    brandEn: "DineSure",
    brandKo: "다인슈어",
    tag: "예약 상태 검증",
    subjectLabel: "예약자",
    providerLabel: "식당",
    codeLabel: "매장 코드",
    certName: "예약 상태 검증",
    campaignTitle: "약속을 지키는 예약 문화를 위해",
    oneLiner: "내가 내 예약 상태를 확인하고, 상태 링크로 필요한 식당에만 보여 줍니다.",
    signTitle: "예약 상태 확인에 서명해 주세요",
    extraAgree: "예약 시간을 지키고 노쇼하지 않는 데 동의합니다.",
    sharePurpose: "예약용",
    path: "/dine",
    verifyPath: "/v",
    riskTypes: {
      noshow: "예약 노쇼(확정)",
      late_cancel: "당일 취소 상습(확정)",
      damage: "매장 기물 파손 미배상(확정)",
    },
  },
  stay: {
    id: "stay",
    label: "펜션·숙박",
    brandEn: "StaySure",
    brandKo: "스테이슈어",
    tag: "숙박 상태 검증",
    subjectLabel: "투숙객",
    providerLabel: "숙소",
    codeLabel: "숙소 코드",
    certName: "숙박 상태 검증",
    campaignTitle: "서로 믿고 머무는 숙박 문화를 위해",
    oneLiner: "내가 내 숙박 상태를 확인하고, 상태 링크로 필요한 숙소에만 보여 줍니다.",
    signTitle: "숙박 상태 확인에 서명해 주세요",
    extraAgree: "숙소 이용수칙·체크인 약속을 지키는 데 동의합니다.",
    sharePurpose: "숙박 예약용",
    path: "/stay",
    verifyPath: "/v",
    riskTypes: {
      stay_noshow: "예약 노쇼(확정)",
      stay_damage: "시설 파손 미배상(확정)",
      stay_rulebreak: "중대 이용수칙 위반(확정)",
    },
  },
};

/** 전체 위험유형 합집합 (관리자·조회 표시용) */
export const RISK_TYPES = Object.values(VERTICALS).reduce((acc, v) => ({ ...acc, ...v.riskTypes }), {});

export function getVertical(id = DEFAULT_VERTICAL) {
  return VERTICALS[id] || VERTICALS[DEFAULT_VERTICAL];
}

export function riskTypesFor(verticalId = DEFAULT_VERTICAL) {
  return getVertical(verticalId).riskTypes;
}

export const CARRIERS = ["SKT", "KT", "LG U+", "알뜰폰"];

export const CONSENT_VERSION = "v1.0";

// 캠페인 톤 — 플랫폼 공통 (버티컬별 oneLiner는 VERTICALS)
export const CAMPAIGN_TITLE = "서로 믿고 거래하는 문화를 위해";
export const CAMPAIGN_HEADLINE = "신뢰를 바탕으로 더 좋은 거래 문화를 만드는 착한거래";
export const CAMPAIGN_LEAD =
  "이번 거래에 동의하고, 내 상태를 확인한 뒤 필요할 때 보내는 서비스입니다.";

// 거래안전 동의 문구 (정식) — 지류 동의서(CONTRACT_CONSENT_FORM)와 동일 내용 유지.
// 업종(렌탈·분양·예약·숙박 등) 공통 — 특정 업종 사례에 묶지 않음.
export const CONSENT_CLAUSES = [
  { t: "제공받는 자", b: "「착한거래」 운영사" },
  { t: "제공 목적", b: "상호 합의한 거래·이용 조건의 미이행 등 거래이력의 기록·보관, 본인 열람 및 본인이 확인을 요청한 상대에게의 상태 확인 제공" },
  { t: "제공 항목", b: "성명, 생년월일, 연락처, 거래·이용 조건 미이행 등 거래이력" },
  { t: "보유·이용 기간", b: "문제 해소 시까지(해소 시 지체 없이 파기), 최장 3년" },
];
// 동의서 하단 ※ 안내 (안심 문구) — 지류와 동일.
export const CONSENT_FOOTNOTES = [
  "정상 이행 시 거래이력이 남지 않습니다.",
  "기록된 거래이력은 암호화 보관되며, 본인과 본인이 동의한 거래 회원사만 열람할 수 있습니다.",
  "이 동의와 함께, 동의 사실이 해당 거래 회원사 콘솔에 기록됩니다. (복사·캡처용 확인서는 발급하지 않습니다.)",
];

// 동의 안내 — 최대한 거부감 없이: 정상이면 무탈 + 본인만 열람 + (마지막 한 줄) 문제 시에만 등록·해소하면 끝
export const CONSENT_NOTICES = [
  { safe: false, title: "필요한 경우에만 확인 후 등록됩니다", body: "합의한 거래·이용 조건의 미이행이 객관적으로 확인된 경우에 한해, 필요한 범위에서 확인 후 등록됩니다." },
  { safe: true,  title: "동의한 회원사만 확인합니다", body: "본인과, 본인이 동의한 거래 회원사만 확인할 수 있으며, 그 외 외부에는 공개되지 않습니다." },
  { safe: true,  title: "정리된 내용은 바로 반영됩니다", body: "이행·정산·합의 등으로 상황이 정리되면 이후 이용에 불필요한 불편이 남지 않도록 반영됩니다." },
];

// 손님 상태확인 안내 (손님 화면 + 가맹사 미리보기 공용)
export const STATUS_NOTICES = [
  { safe: true,  title: "본인만 열람할 수 있습니다", body: "본인인증한 본인 외에는 플랫폼·타사 누구도 볼 수 없습니다." },
  { safe: false, title: "거래이력이 있는 경우", body: "사유를 확인하고, 해결하셨다면 증빙과 함께 해제를 신청하실 수 있습니다." },
  { safe: true,  title: "상대에게 보여줄 때", body: "화면 캡처·확인서 복사는 위조될 수 있습니다. 반드시 앱에서 만든 상태 링크만 보내 주세요." },
];

// 고객센터 (본인 폰 없는 손님용)
export const SUPPORT = { tel: "1600-0000", email: "help@chakan.kr" };

// 가맹사가 자사 계약서/동의서에 직접 삽입하는 양식 (복사용)
// ※ 제공받는 자 = 플랫폼 1곳. 가맹사 확인은 본인 경유(본인 자발적 제출)라 동의 대상서 제외.
export const CONTRACT_CONSENT_FORM =
`■ 개인정보 제3자 제공 동의 — 착한거래

· 제공받는 자 : 「착한거래」 운영사
· 제공 목적 : 상호 합의한 거래·이용 조건의 미이행 등 거래이력의 기록·보관, 본인 열람 및 본인이 확인을 요청한 상대에게의 상태 확인 제공
· 제공 항목 : 성명, 생년월일, 연락처, 거래·이용 조건 미이행 등 거래이력
· 보유·이용 기간 : 문제 해소 시까지(해소 시 지체 없이 파기), 최장 3년

※ 정상 이행 시 거래이력이 남지 않습니다.
※ 기록된 거래이력은 암호화 보관되며, 본인만 본인인증으로 열람할 수 있습니다.
※ 신규 계약 시에는 본인이 상태 링크로 확인하여 상대 회원사에 전달합니다.

[ ] 동의함    [ ] 동의하지 않음`;

