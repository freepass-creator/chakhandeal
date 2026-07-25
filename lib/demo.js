import { DEMO_MODE } from "@/lib/constants";

/** 1×1 투명 GIF — 카메라 없이 사진 필드 채울 때 */
export const DEMO_IMG =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** 눌러서 체험용 샘플 본인 */
export const DEMO_USERS = {
  clean: {
    key: "clean",
    label: "이력 없음 · 김신규",
    name: "김신규",
    birth: "950101",
    phone: "010-1234-5678",
  },
  hit: {
    key: "hit",
    label: "이력 있음 · 홍길동",
    name: "홍길동",
    birth: "900715",
    phone: "010-5555-1212",
  },
  petHit: {
    key: "petHit",
    label: "이력 있음 · 김반려",
    name: "김반려",
    birth: "950101",
    phone: "010-7777-8888",
  },
};

export const DEMO_CODES = [
  { code: "1001", label: "테스트렌탈" },
  { code: "2001", label: "해피펫분양" },
];

/** 시연용 회원 로그인 — 업종별 콘솔을 바로 보여줄 때 사용 */
export const DEMO_LOGINS = [
  { label: "테스트렌탈 (렌탈)", email: "test@test.com", password: "test1234" },
  { label: "해피펫분양 (반려)", email: "pet@test.com", password: "test1234" },
];

export function demoVerified(persona = "clean") {
  const u = DEMO_USERS[persona] || DEMO_USERS.clean;
  return {
    name: u.name,
    birth: u.birth,
    phone: u.phone,
    method: "데모 샘플 본인확인",
    idImage: DEMO_IMG,
    faceImage: DEMO_IMG,
  };
}

export function isDemo() {
  return !!DEMO_MODE;
}

/** 업종에 맞는 시연 샘플 칩 — pet이면 pet 위반 사례(김반려)를 노출 */
export function demoPersonasFor(vertical) {
  return vertical === "pet" ? ["clean", "petHit"] : ["clean", "hit"];
}
