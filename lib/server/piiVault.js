// pii_vault — 서버 전용. IdV 스텁 동안 matchKey당 1 엔트리(E1 권장 잠정).
import { createHash, randomUUID } from "crypto";
import { getAdmin } from "./admin";
import { encryptFields, decryptFields, resolveKek } from "./crypto";

const g = globalThis;

function piiStore() {
  if (!g.__rsProStore) g.__rsProStore = {};
  if (!(g.__rsProStore.pii instanceof Map)) g.__rsProStore.pii = new Map();
  return g.__rsProStore.pii;
}

/** matchKey → 결정적 vault id (동일 신원 재사용) */
export function piiIdForMatchKey(matchKey) {
  const h = createHash("sha256").update(String(matchKey || ""), "utf8").digest("hex").slice(0, 32);
  return `pii_${h}`;
}

/**
 * @param {{ matchKey: string, subjectUserId?: string, fields: Record<string, string> }} p
 * @returns {Promise<string>} piiRef
 */
export async function upsertPiiVault({ matchKey, subjectUserId = "", fields }) {
  resolveKek(); // fail-closed early
  const piiId = matchKey ? piiIdForMatchKey(matchKey) : `pii_${randomUUID().replace(/-/g, "")}`;
  const enc = encryptFields(fields);
  const { version } = resolveKek();
  const doc = {
    matchKey: matchKey || "",
    subjectUserId: subjectUserId || "",
    enc,
    keyVersion: version,
    updatedAt: new Date().toISOString(),
  };

  const { ready, db } = getAdmin();
  if (ready) {
    const ref = db.collection("pii_vault").doc(piiId);
    const snap = await ref.get();
    if (snap.exists) {
      const prev = snap.data() || {};
      await ref.set({
        ...doc,
        enc: { ...(prev.enc || {}), ...enc },
        createdAt: prev.createdAt || new Date(),
      }, { merge: true });
    } else {
      await ref.set({ ...doc, createdAt: new Date() });
    }
  } else {
    const prev = piiStore().get(piiId) || {};
    piiStore().set(piiId, {
      ...doc,
      enc: { ...(prev.enc || {}), ...enc },
      createdAt: prev.createdAt || doc.updatedAt,
    });
  }
  return piiId;
}

/** @returns {Promise<Record<string, string> | null>} */
export async function readPiiVault(piiRef) {
  if (!piiRef) return null;
  resolveKek();
  const { ready, db } = getAdmin();
  let row = null;
  if (ready) {
    const snap = await db.collection("pii_vault").doc(piiRef).get();
    if (snap.exists) row = snap.data();
  } else {
    row = piiStore().get(piiRef) || null;
  }
  if (!row?.enc) return null;
  return decryptFields(row.enc);
}

/** 표시용 — 이름만 (실패 시 빈 문자열) */
export async function revealName(piiRef) {
  const f = await readPiiVault(piiRef);
  return f?.name || "";
}

export async function revealPii(piiRef, keys = ["name", "birth", "phone"]) {
  const f = await readPiiVault(piiRef);
  if (!f) return {};
  const out = {};
  for (const k of keys) out[k] = f[k] || "";
  return out;
}
