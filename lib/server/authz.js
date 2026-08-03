// 인가 게이트 — canReadTransaction + 본인확인 토큰 추출
import { verifyIdentityToken } from "./identityToken";
import { writeAudit } from "./audit";

/** Phase 4 스텁 — consent_grant 열람권한 모델 전까지 항상 false */
export function hasValidConsentGrant(_actor, _record) {
  return false;
}

export function isDataSubject(actor, record) {
  const tok = actor?.subjectToken;
  if (!tok) return false;
  if (tok.userId && record?.subjectUserId && tok.userId === record.subjectUserId) return true;
  if (tok.matchKey && record?.matchKey && tok.matchKey === record.matchKey) return true;
  return false;
}

export function isOwnerCompany(actor, record) {
  return !!(actor?.companyId && record?.ownerCompanyId && actor.companyId === record.ownerCompanyId);
}

/** I1: isDataSubject ∨ isOwnerCompany ∨ hasValidConsentGrant */
export function canReadTransaction(actor, record) {
  if (!actor || !record) return false;
  return isDataSubject(actor, record) || isOwnerCompany(actor, record) || hasValidConsentGrant(actor, record);
}

/**
 * 요청에서 본인확인 토큰 문자열 추출.
 * 우선순위: body.identityToken → X-Identity-Token → Authorization: Bearer idv.…
 */
export function extractIdentityTokenString(req, body = null) {
  if (body?.identityToken) return String(body.identityToken).trim();
  const hdr = req.headers.get("x-identity-token") || "";
  if (hdr.trim()) return hdr.trim();
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  if (bearer.startsWith("idv.")) return bearer;
  return "";
}

export async function auditAccessDeny({ actor, endpoint, reason }) {
  const who = typeof actor === "string"
    ? actor
    : (actor?.email || actor?.subjectToken?.userId || actor?.uid || "anonymous");
  await writeAudit({
    action: "access_deny",
    actor: who,
    meta: { endpoint, reason },
  });
}

/**
 * 본인 경로 진입 게이트. 없거나 무효면 401 + access_deny.
 * @returns {{ userId: string, matchKey: string, method: string }}
 */
export async function requireVerifiedSubject(req, body = null, { endpoint = "unknown" } = {}) {
  const raw = extractIdentityTokenString(req, body);
  if (!raw) {
    await auditAccessDeny({ actor: "anonymous", endpoint, reason: "missing_identity_token" });
    const e = new Error("본인확인이 필요합니다.");
    e.status = 401;
    e.code = "AUTH_REQUIRED";
    throw e;
  }
  const subject = verifyIdentityToken(raw);
  if (!subject) {
    await auditAccessDeny({ actor: "anonymous", endpoint, reason: "invalid_identity_token" });
    const e = new Error("본인확인 토큰이 유효하지 않습니다.");
    e.status = 401;
    e.code = "AUTH_REQUIRED";
    throw e;
  }
  return subject;
}

/** canRead 실패 시 403 + 감사 */
export async function assertCanRead(actor, record, { endpoint = "unknown" } = {}) {
  if (canReadTransaction(actor, record)) return true;
  await auditAccessDeny({
    actor,
    endpoint,
    reason: "can_read_denied",
  });
  const e = new Error("열람 권한이 없습니다.");
  e.status = 403;
  e.code = "FORBIDDEN";
  throw e;
}
