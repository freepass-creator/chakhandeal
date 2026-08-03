// PII 봉투암호화 — AES-256-GCM + KEK 래핑. 키 용도 분리(matchKey·세션·IdV·phoneLookup와 별개).
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";

const KEK_LEN = 32;

let _kek = null;
let _kekVersion = null;
let _phoneLookupSecret = null;
let _companyTokenSecret = null;

function demoOff() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "false";
}

function parseKekHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  const h = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(h)) return null;
  return Buffer.from(h, "hex");
}

/** 운영 fail-closed / 데모 부팅랜덤 */
export function resolveKek() {
  if (_kek) return { kek: _kek, version: _kekVersion };
  const envKek = parseKekHex(process.env.PII_KEK);
  if (envKek) {
    _kek = envKek;
    _kekVersion = process.env.PII_KEK_VERSION || "env-v1";
    return { kek: _kek, version: _kekVersion };
  }
  if (demoOff() && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("[착한거래] PII_KEK(64 hex)가 필요합니다. (운영 봉투암호화 KEK)");
  }
  _kek = randomBytes(KEK_LEN);
  _kekVersion = "demo-boot";
  return { kek: _kek, version: _kekVersion };
}

function phoneLookupKey() {
  if (_phoneLookupSecret) return _phoneLookupSecret;
  const env = process.env.PHONE_LOOKUP_SECRET;
  if (env && env.length >= 16) {
    _phoneLookupSecret = Buffer.from(env);
    return _phoneLookupSecret;
  }
  if (demoOff() && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("[착한거래] PHONE_LOOKUP_SECRET가 필요합니다.");
  }
  // 데모: KEK에서 파생(프로세스 생존 동안 안정) — 운영 env와 별개 키 슬롯
  _phoneLookupSecret = createHmac("sha256", resolveKek().kek).update("phone-lookup").digest();
  return _phoneLookupSecret;
}

function companyTokenMaster() {
  if (_companyTokenSecret) return _companyTokenSecret;
  const env = process.env.COMPANY_TOKEN_SECRET;
  if (env && env.length >= 16) {
    _companyTokenSecret = Buffer.from(env);
    return _companyTokenSecret;
  }
  if (demoOff() && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("[착한거래] COMPANY_TOKEN_SECRET가 필요합니다.");
  }
  _companyTokenSecret = createHmac("sha256", resolveKek().kek).update("company-token").digest();
  return _companyTokenSecret;
}

function wrapDek(dek, kek) {
  // AES-256-GCM으로 DEK 래핑 (iv·tag 포함)
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64url");
}

function unwrapDek(wrapped, kek) {
  const buf = Buffer.from(wrapped, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * @param {string} plaintext
 * @returns {{ ct: string, iv: string, tag: string, wrappedDek: string, keyVersion: string }}
 */
export function encryptField(plaintext) {
  const { kek, version } = resolveKek();
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext ?? ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ct: ct.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    wrappedDek: wrapDek(dek, kek),
    keyVersion: version,
  };
}

/**
 * @param {{ ct: string, iv: string, tag: string, wrappedDek: string, keyVersion?: string }} enc
 * @returns {string}
 */
export function decryptField(enc) {
  if (!enc?.ct || !enc?.iv || !enc?.tag || !enc?.wrappedDek) return "";
  const { kek } = resolveKek();
  // 데모 부팅랜덤 KEK는 프로세스 재시작 시 구 암호문 복호 불가 — 운영은 env/KMS keyVersion으로 유지
  const dek = unwrapDek(enc.wrappedDek, kek);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    dek,
    Buffer.from(enc.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(enc.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(enc.ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/** HMAC-SHA256(lookupKey, normalizePhone) — 중복·전화조회용. PII 원문 미포함. */
export function phoneLookupToken(phone) {
  const n = normalizePhone(phone);
  if (n.length < 10) return "";
  return createHmac("sha256", phoneLookupKey()).update(n, "utf8").digest("hex");
}

/**
 * 회사별 키 재료 — companyId마다 상이. 상수키 금지.
 * 승인 시 발급한 wrappedCompanyKey가 있으면 그걸 쓰고, 없으면 master에서 결정적 파생(빌트인·백필).
 */
export function deriveCompanyKeyMaterial(companyId) {
  if (!companyId) return null;
  return createHmac("sha256", companyTokenMaster()).update(`company:${companyId}`, "utf8").digest();
}

export function wrapCompanyKey(rawKeyBuf) {
  const { kek, version } = resolveKek();
  return { wrapped: wrapDek(rawKeyBuf, kek), keyVersion: version };
}

export function unwrapCompanyKey(wrapped) {
  const { kek } = resolveKek();
  return unwrapDek(wrapped, kek);
}

/** company_user_token = HMAC(회사별키, subjectUserId) — 회사마다 값이 다름 */
export function companyUserToken(companyKeyBuf, subjectUserId) {
  if (!companyKeyBuf || !subjectUserId) return "";
  return createHmac("sha256", companyKeyBuf).update(String(subjectUserId), "utf8").digest("hex");
}

/** 여러 필드를 각각 봉투암호화 */
export function encryptFields(obj) {
  const enc = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === "") continue;
    enc[k] = encryptField(String(v));
  }
  return enc;
}

export function decryptFields(enc) {
  const out = {};
  for (const [k, v] of Object.entries(enc || {})) {
    try { out[k] = decryptField(v); } catch { out[k] = ""; }
  }
  return out;
}

/** 테스트용 — 프로세스 내 캐시 리셋 */
export function __resetCryptoForTests() {
  _kek = null;
  _kekVersion = null;
  _phoneLookupSecret = null;
  _companyTokenSecret = null;
}
