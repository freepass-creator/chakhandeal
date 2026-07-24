// 단순 IP 기반 rate-limit (프로세스 메모리). OCR/공개 API 남용 완화.
const g = globalThis;
if (!g.__rsRate) g.__rsRate = new Map();

/**
 * @param {string} key
 * @param {{ limit?: number, windowMs?: number }} opts
 * @returns {{ ok: boolean, retryAfterMs?: number }}
 */
export function rateLimit(key, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  let bucket = g.__rsRate.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    g.__rsRate.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterMs: windowMs - (now - bucket.start) };
  }
  return { ok: true };
}

export function clientIp(req) {
  const xf = req.headers.get("x-forwarded-for") || "";
  return xf.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
