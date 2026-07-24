// 매칭키 — 이름+생년월일 HMAC. 서버 전용. 클라이언트에 secret 노출 금지.
import { createHmac } from "crypto";
import { cleanBirth } from "@/lib/format";

const DEV_FALLBACK = "rentsafe-pro-dev-secret-change-me";

/** 운영에서는 MATCH_HMAC_SECRET 필수. 개발만 폴백 허용. */
export function hmacSecret() {
  const s = process.env.MATCH_HMAC_SECRET;
  if (s && s !== DEV_FALLBACK) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MATCH_HMAC_SECRET 이 운영 환경에 설정되지 않았습니다.");
  }
  return s || DEV_FALLBACK;
}

export function normalizeName(name) {
  return String(name || "")
    .normalize("NFC")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

export function matchMaterial(name, birth) {
  const n = normalizeName(name);
  const b = cleanBirth(birth);
  if (!n || b.length !== 6) return null;
  return `${n}|${b}`;
}

export function makeMatchKey(name, birth, secret = process.env.MATCH_HMAC_SECRET) {
  const material = matchMaterial(name, birth);
  if (!material) return null;
  const key = secret || hmacSecret();
  return createHmac("sha256", key).update(material, "utf8").digest("hex");
}
