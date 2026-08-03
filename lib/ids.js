// 불변 식별자 SSOT — 클라·서버 공용 (Node API 없음).
// 서버 코드는 `@/lib/server/ids` 또는 여기 직접 import 가능.

/** 테스트렌탈 (test@test.com · code 1001) */
export const CID_TEST_RENT = "a1000001-1001-4000-8000-000000000001";
/** 해피펫분양 (pet@test.com · code 2001) */
export const CID_PET = "a2000001-2001-4000-8000-000000000002";

/** 김신규 — 이력 없음 */
export const UID_CLEAN = "b0000001-c1ea-4000-8000-000000000001";
/** 홍길동(900715) — 렌탈 이력 */
export const UID_HIT = "b0000002-4170-4000-8000-000000000002";
/** 김반려 — 반려 이력 */
export const UID_PET_HIT = "b0000003-be70-4000-8000-000000000003";

/** 이메일 → 고정 companyId (admin은 없음) */
export const BUILTIN_COMPANY_IDS = {
  "test@test.com": CID_TEST_RENT,
  "pet@test.com": CID_PET,
};

/** 거래코드 → 고정 companyId (데모 회원사) */
export const COMPANY_ID_BY_CODE = {
  "1001": CID_TEST_RENT,
  "2001": CID_PET,
};

/** 데모 페르소나 key → userId */
export const DEMO_USER_IDS = {
  clean: UID_CLEAN,
  hit: UID_HIT,
  petHit: UID_PET_HIT,
};

export function companyIdForEmail(email) {
  return BUILTIN_COMPANY_IDS[String(email || "").toLowerCase()] || "";
}

export function companyIdForCode(code) {
  return COMPANY_ID_BY_CODE[String(code || "").trim()] || "";
}
