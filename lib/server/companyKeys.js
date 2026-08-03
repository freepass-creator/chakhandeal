// 회사별 키 — company_user_token 산출용. 승인 시 발급·KEK 래핑 저장.
import { randomBytes } from "crypto";
import { getAdmin } from "./admin";
import {
  deriveCompanyKeyMaterial,
  wrapCompanyKey,
  unwrapCompanyKey,
  companyUserToken,
  resolveKek,
} from "./crypto";

const g = globalThis;

function keyStore() {
  if (!g.__rsProStore) g.__rsProStore = {};
  if (!(g.__rsProStore.companyKeys instanceof Map)) g.__rsProStore.companyKeys = new Map();
  return g.__rsProStore.companyKeys;
}

/**
 * 회사 키 확보(없으면 발급). 빌트인/데모는 deriveCompanyKeyMaterial로 결정적.
 * @returns {Promise<Buffer>}
 */
export async function ensureCompanyKey(companyId, { deterministic = false } = {}) {
  if (!companyId) return null;
  resolveKek();

  const existing = await loadWrapped(companyId);
  if (existing) return unwrapCompanyKey(existing.wrapped);

  const raw = deterministic || isBuiltinCompany(companyId)
    ? deriveCompanyKeyMaterial(companyId)
    : randomBytes(32);
  const wrapped = wrapCompanyKey(raw);
  await saveWrapped(companyId, wrapped);
  return raw;
}

function isBuiltinCompany(companyId) {
  // lib/ids 고정 CID — 데모 재시작에도 동일 company_user_token
  return String(companyId).startsWith("a1000001-") || String(companyId).startsWith("a2000001-");
}

async function loadWrapped(companyId) {
  const { ready, db } = getAdmin();
  if (ready) {
    try {
      const snap = await db.collection("company_keys").doc(companyId).get();
      if (snap.exists) return snap.data();
    } catch { /* ignore */ }
    return null;
  }
  return keyStore().get(companyId) || null;
}

async function saveWrapped(companyId, { wrapped, keyVersion }) {
  const row = { wrapped, keyVersion, createdAt: new Date().toISOString() };
  const { ready, db } = getAdmin();
  if (ready) {
    await db.collection("company_keys").doc(companyId).set(row, { merge: true });
  } else {
    keyStore().set(companyId, row);
  }
}

/** subjectUserId → 회사-대면 토큰 */
export async function mintCompanyUserToken(companyId, subjectUserId) {
  if (!companyId || !subjectUserId) return "";
  const key = await ensureCompanyKey(companyId);
  return companyUserToken(key, subjectUserId);
}
