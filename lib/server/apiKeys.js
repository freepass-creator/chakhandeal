// M2M API Key — Authorization: ApiKey <raw>
// 평문 보관 금지. 해시(SHA-256) 저장. 데모는 env 시드만 허용.
import { createHash, timingSafeEqual } from "crypto";
import { getAdmin } from "./admin";
import { durableRead, durableWrite } from "./durableStore";

const COL = "api_keys";
const FILE = "api_keys";

function hashKey(raw) {
  return createHash("sha256").update(String(raw || ""), "utf8").digest("hex");
}

function safeEqHex(a, b) {
  try {
    const ba = Buffer.from(String(a), "hex");
    const bb = Buffer.from(String(b), "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * 데모/테스트 시드: DEMO_MEMBER_API_KEYS=freepass:secret,other:secret2
 * 또는 MEMBER_API_KEYS_JSON={"freepass":"<sha256 hex>"}
 */
function envSeedEntries() {
  const out = [];
  const demo = process.env.DEMO_MEMBER_API_KEYS || "";
  for (const part of demo.split(",")) {
    const s = part.trim();
    if (!s) continue;
    const i = s.indexOf(":");
    if (i <= 0) continue;
    const memberCompany = s.slice(0, i).trim();
    const raw = s.slice(i + 1).trim();
    if (!memberCompany || !raw) continue;
    out.push({ memberCompany, keyHash: hashKey(raw), label: "env-demo" });
  }
  const json = process.env.MEMBER_API_KEYS_JSON || "";
  if (json) {
    try {
      const map = JSON.parse(json);
      for (const [memberCompany, keyHash] of Object.entries(map || {})) {
        if (memberCompany && keyHash) out.push({ memberCompany, keyHash: String(keyHash), label: "env-hash" });
      }
    } catch { /* ignore */ }
  }
  return out;
}

function fileLoad() {
  return durableRead(FILE, () => ({ keys: [] }));
}

function fileSave(store) {
  durableWrite(FILE, store);
}

async function listKeys() {
  const seeded = envSeedEntries();
  const { ready, db } = getAdmin();
  if (ready) {
    try {
      const snap = await db.collection(COL).get();
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return [...seeded, ...rows];
    } catch {
      return seeded;
    }
  }
  const store = fileLoad();
  return [...seeded, ...(store.keys || [])];
}

/**
 * 데모·테스트용 키 등록(해시만 저장).
 * @param {string} memberCompany
 * @param {string} rawKey
 */
export async function upsertApiKey(memberCompany, rawKey, { label = "manual" } = {}) {
  const mc = String(memberCompany || "").trim();
  const raw = String(rawKey || "").trim();
  if (!mc || !raw) throw Object.assign(new Error("memberCompany·key 필요"), { status: 400 });
  const keyHash = hashKey(raw);
  const row = { memberCompany: mc, keyHash, label, updatedAt: Date.now() };
  const { ready, db } = getAdmin();
  if (ready) {
    await db.collection(COL).doc(keyHash).set(row, { merge: true });
    return { memberCompany: mc, keyHash };
  }
  const store = fileLoad();
  store.keys = (store.keys || []).filter((k) => k.keyHash !== keyHash);
  store.keys.push(row);
  fileSave(store);
  return { memberCompany: mc, keyHash };
}

/**
 * @param {Request} req
 * @returns {Promise<{ memberCompany: string }>}
 */
export async function requireApiKey(req) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^ApiKey\s+(.+)$/i);
  if (!m) {
    const e = new Error("API Key 인증이 필요합니다.");
    e.status = 401;
    e.code = "API_KEY_REQUIRED";
    throw e;
  }
  const raw = m[1].trim();
  if (!raw) {
    const e = new Error("API Key가 비어 있습니다.");
    e.status = 401;
    e.code = "API_KEY_INVALID";
    throw e;
  }
  const want = hashKey(raw);
  const keys = await listKeys();
  const hit = keys.find((k) => safeEqHex(k.keyHash, want));
  if (!hit?.memberCompany) {
    const e = new Error("API Key가 유효하지 않습니다.");
    e.status = 401;
    e.code = "API_KEY_INVALID";
    throw e;
  }
  return { memberCompany: String(hit.memberCompany) };
}

export function hashApiKeyForTest(raw) {
  return hashKey(raw);
}
