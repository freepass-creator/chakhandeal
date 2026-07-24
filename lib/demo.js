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
};

export const DEMO_CODES = [
  { code: "1001", label: "테스트렌탈" },
  { code: "2001", label: "해피펫분양" },
];

export const DEMO_LOGIN = { email: "test@test.com", password: "test1234" };

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
