/**
 * 회원사(공급사) 프로필 — 손님 화면 앞에 서는 «이름».
 *
 * 손님은 착한거래를 모른다. 프리패스·JPK 같은 «자기가 거래하는 회사»와 계약한다고 안다.
 * 그래서 화면 상단·문의처는 회원사 것이어야 하고, 착한거래는 뒤에 있는 인프라로 남는다.
 * (도메인을 `sign.freepasserp.com` 으로 둔 것과 같은 이유다.)
 *
 * 계약마다 바뀌지 않는 값이므로 payload 로 매번 받지 않고 여기서 갖는다.
 * **새 공급사 연동 = 여기 한 블록 + 도메인 CNAME 한 줄.**
 *
 * 운영에서는 `MEMBER_PROFILES` (JSON) 로 덮어쓴다.
 *   MEMBER_PROFILES={"freepass":{"name":"제이피케이모빌리티 ㈜","supportPhone":"1544-3871"}}
 */

const BUILTIN = {
  freepass: {
    name: "제이피케이모빌리티 ㈜",
    shortName: "프리패스",
    supportPhone: "1544-3871",
  },
};

function fromEnv() {
  try {
    const v = JSON.parse(process.env.MEMBER_PROFILES || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * 화면에 쓸 회원사 정보. 등록이 없으면 «이름 없음»으로 돌려준다 —
 * 여기서 착한거래 이름으로 대체하지 않는다. 손님에게 낯선 이름이 나가면 안 된다.
 */
export function memberProfile(memberCompany) {
  const key = String(memberCompany || "").trim();
  const env = fromEnv();
  const p = env[key] || BUILTIN[key] || null;
  return {
    key,
    name: String(p?.name || "").trim(),
    shortName: String(p?.shortName || p?.name || "").trim(),
    supportPhone: String(p?.supportPhone || "").trim(),
  };
}
