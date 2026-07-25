// 매칭키 — 이름+생년월일 HMAC. 서버 전용. 클라이언트에 secret 노출 금지.
import { createHmac } from "crypto";
import { cleanBirth } from "@/lib/format";

const DEV_FALLBACK = "rentsafe-pro-dev-secret-change-me";

/**
 * 운영에서는 MATCH_HMAC_SECRET(예시값 아닌 실키) 권장.
 * 빌드·시연 배포에서 미설정이어도 기동은 되도록 폴백(데모용). 실서비스 전 Vercel에 실키 설정.
 */
export function hmacSecret() {
  const s = process.env.MATCH_HMAC_SECRET;
  if (s && s !== DEV_FALLBACK) return s;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    console.warn("[착한거래] MATCH_HMAC_SECRET 미설정 — 시연용 폴백 사용 중. Vercel env에 실키를 넣으세요.");
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
