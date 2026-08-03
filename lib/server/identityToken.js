// 본인확인 토큰 — 세션(회원사) 토큰과 별개. 정보주체가 "본인임"을 증명.
// issueIdentityToken → idv.<b64url(payload)>.<sig>
// payload: userId + matchKey + PII HMAC 바인딩(원문 미포함).
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { cleanBirth } from "@/lib/format";
import { makeMatchKey } from "./matchKey";

const IDV_PREFIX = "idv.";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

let _idSecret = null;
function secret() {
  if (_idSecret) return _idSecret;
  const env = process.env.IDENTITY_SIGNING_SECRET;
  if (env && env.length >= 16) { _idSecret = env; return _idSecret; }
  const demoOff = process.env.NEXT_PUBLIC_DEMO_MODE === "false";
  if (demoOff && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("[착한거래] IDENTITY_SIGNING_SECRET가 필요합니다. (운영 본인확인 토큰 서명키)");
  }
  _idSecret = randomBytes(32).toString("hex");
  return _idSecret;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function fromB64url(s) {
  return Buffer.from(s, "base64url").toString("utf8");
}

function bindHash(field, value) {
  const v = field === "birth"
    ? cleanBirth(value)
    : String(value || "").trim().toLowerCase().replace(/[\s-]/g, "");
  return createHmac("sha256", secret()).update(`${field}:${v}`).digest("hex");
}

/**
 * @param {{ userId: string, name: string, birth: string, phone?: string, method?: string }} p
 * @returns {string}
 */
export function issueIdentityToken({ userId, name, birth, phone = "", method = "unknown" }) {
  if (!userId) throw Object.assign(new Error("userId 필요"), { status: 400 });
  const matchKey = makeMatchKey(name, birth);
  if (!matchKey) throw Object.assign(new Error("이름·생년월일이 올바르지 않습니다."), { status: 400 });
  const payload = {
    userId,
    matchKey,
    nameHash: bindHash("name", name),
    birthHash: bindHash("birth", birth),
    phoneHash: bindHash("phone", phone),
    method: method || "unknown",
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${IDV_PREFIX}${body}.${sig}`;
}

/** @returns {{ userId: string, matchKey: string, method: string } | null} */
export function verifyIdentityToken(token) {
  if (!token?.startsWith(IDV_PREFIX)) return null;
  const raw = token.slice(IDV_PREFIX.length);
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const body = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expect = createHmac("sha256", secret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(fromB64url(body));
  } catch {
    return null;
  }
  if (!payload?.userId || !payload?.matchKey || !payload.exp || payload.exp < Date.now()) return null;
  return {
    userId: payload.userId,
    matchKey: payload.matchKey,
    method: payload.method || "unknown",
  };
}
