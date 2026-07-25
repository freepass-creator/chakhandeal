// 매칭키 — 이름+생년월일 HMAC. 서버 전용. 클라이언트에 secret 노출 금지.
import { createHmac } from "crypto";
import { cleanBirth } from "@/lib/format";

const DEV_FALLBACK = "rentsafe-pro-dev-secret-change-me";

function demoAllowed() {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}

/**
 * 운영(DEMO 끔)에서는 MATCH_HMAC_SECRET 필수 — 폴백 시크릿 사용 시 즉시 실패.
 * 시연(DEMO 기본)에서는 폴백 허용 + 경고.
 */
export function hmacSecret() {
  const s = process.env.MATCH_HMAC_SECRET;
  const usable = s && s !== DEV_FALLBACK ? s : null;

  if (usable) return usable;

  if (process.env.NODE_ENV === "production" && !demoAllowed()) {
    throw new Error(
      "[착한거래] MATCH_HMAC_SECRET가 없습니다. 운영 환경에서는 Vercel env에 실키를 넣으세요."
    );
  }

  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    console.warn("[착한거래] MATCH_HMAC_SECRET 미설정 — 시연용 폴백 사용 중. Vercel env에 실키를 넣으세요.");
  }
  return DEV_FALLBACK;
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

export function makeMatchKey(name, birth, secret) {
  const material = matchMaterial(name, birth);
  if (!material) return null;
  const key = secret || hmacSecret();
  return createHmac("sha256", key).update(material, "utf8").digest("hex");
}
