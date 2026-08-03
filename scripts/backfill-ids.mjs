/**
 * Firestore 일회성 백필 — companyId / ownerCompanyId / subjectUserId
 * 멱등: 이미 값이 있으면 건너뜀.
 *
 * 사용:
 *   FIREBASE_ADMIN_PATH=./service-account.json node scripts/backfill-ids.mjs
 *   # 또는 FIREBASE_ADMIN_JSON=...
 */
import { readFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

function loadCredential() {
  const json = process.env.FIREBASE_ADMIN_JSON;
  if (json) {
    try { return JSON.parse(json); } catch { /* fall through */ }
  }
  const path = process.env.FIREBASE_ADMIN_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  return null;
}

const cred = loadCredential();
if (!cred) {
  console.error("FIREBASE_ADMIN_JSON 또는 FIREBASE_ADMIN_PATH 가 필요합니다.");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(cred) });
}
const db = admin.firestore();

async function backfillMembers() {
  const snap = await db.collection("members").get();
  let n = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.companyId) continue;
    if (d.status !== "approved" && d.role === "admin") continue;
    await doc.ref.update({ companyId: randomUUID() });
    n += 1;
  }
  console.log(`members companyId 부여: ${n}`);
  return n;
}

async function companyMap() {
  const snap = await db.collection("members").get();
  const byCode = new Map();
  const byCompany = new Map();
  snap.docs.forEach((doc) => {
    const d = doc.data();
    if (!d.companyId) return;
    if (d.code) byCode.set(String(d.code), d.companyId);
    if (d.company) byCompany.set(String(d.company), d.companyId);
  });
  return { byCode, byCompany };
}

async function backfillCollection(name, resolveOwner) {
  const snap = await db.collection(name).get();
  let n = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const patch = {};
    if (!d.ownerCompanyId) {
      const cid = resolveOwner(d);
      if (cid) patch.ownerCompanyId = cid;
    }
    // subjectUserId는 실 IdV 전엔 이름 매칭이 위험 — 빈 값 유지(데모 시드는 코드 상수로 처리)
    if (Object.keys(patch).length === 0) continue;
    await doc.ref.update(patch);
    n += 1;
  }
  console.log(`${name} ownerCompanyId 부여: ${n}`);
}

async function main() {
  await backfillMembers();
  const { byCode, byCompany } = await companyMap();
  const resolve = (d) =>
    (d.code && byCode.get(String(d.code))) ||
    (d.company && byCompany.get(String(d.company))) ||
    (d.providerCode && byCode.get(String(d.providerCode))) ||
    (d.providerCompany && byCompany.get(String(d.providerCompany))) ||
    "";
  await backfillCollection("risks", resolve);
  await backfillCollection("consents", resolve);
  await backfillCollection("certificates", resolve);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
