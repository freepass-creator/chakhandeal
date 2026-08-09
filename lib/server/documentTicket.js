/**
 * 계약서 열람 «표» — 본인확인을 통과한 사람만 A4 계약서를 볼 수 있게 한다.
 *
 * 왜 신원 토큰을 그대로 URL 에 붙이지 않는가:
 *   계약서는 새 창에서 열려야 인쇄가 된다. 그런데 URL 에 실린 값은 브라우저 방문기록·
 *   서버 접근로그·referrer 에 남는다. 신원 토큰은 수명이 길어서 그게 새면 계속 쓸 수 있다.
 *   그래서 «이 계약 한 건, 몇 분짜리» 표를 따로 끊어 URL 에 싣는다.
 *
 * 표에는 계약 ID 와 만료 시각만 들어간다. 개인정보는 넣지 않는다.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const TICKET_TTL_MS = 10 * 60 * 1000;   // 10분 — 열어서 인쇄할 만큼만

function secret() {
  const s = process.env.IDENTITY_SIGNING_SECRET || process.env.SESSION_SIGNING_SECRET || "";
  if (!s) {
    // 비밀키 없이 서명하면 아무나 표를 위조한다. 조용히 넘어가면 안 된다.
    throw Object.assign(new Error("문서 열람 설정이 없습니다."), { status: 500, code: "TICKET_SECRET_MISSING" });
  }
  return `${s}:document-ticket`;   // 다른 용도의 토큰과 서로 바꿔 쓸 수 없게 분리
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");

function sign(body) {
  return createHmac("sha256", secret()).update(body, "utf8").digest("base64url");
}

/** @returns {{ticket:string, expiresAt:number}} */
export function issueDocumentTicket(contractId, { now = Date.now(), ttlMs = TICKET_TTL_MS } = {}) {
  const id = String(contractId || "").trim();
  if (!id) throw Object.assign(new Error("contractId 필요"), { status: 400 });
  const expiresAt = now + ttlMs;
  const body = b64u(`${id}.${expiresAt}`);
  return { ticket: `${body}.${sign(body)}`, expiresAt };
}

/**
 * 표를 확인한다. 계약 ID 가 «요청한 그 계약»과 같아야 한다 —
 * 그러지 않으면 A 계약의 표로 B 계약서를 열 수 있다.
 * @returns {boolean}
 */
export function verifyDocumentTicket(ticket, contractId, { now = Date.now() } = {}) {
  const parts = String(ticket || "").split(".");
  if (parts.length !== 2) return false;
  const [body, mac] = parts;

  const expected = Buffer.from(sign(body));
  const given = Buffer.from(String(mac));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  let decoded;
  try {
    decoded = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return false;
  }

  const at = decoded.lastIndexOf(".");
  if (at < 1) return false;
  const id = decoded.slice(0, at);
  const exp = Number(decoded.slice(at + 1));

  if (!Number.isFinite(exp) || exp <= now) return false;
  return id === String(contractId || "").trim();
}
