/**
 * Firestore 평문 PII → vault 이관 (멱등).
 * FIREBASE_ADMIN_PATH=./service-account.json node scripts/encrypt-pii.mjs
 */
import { readFileSync, existsSync } from "fs";
import { createRequire } from "module";
import { createHash } from "crypto";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

function loadCredential() {
  const json = process.env.FIREBASE_ADMIN_JSON;
  if (json) {
    try { return JSON.parse(json); } catch { /* */ }
  }
  const path = process.env.FIREBASE_ADMIN_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  return null;
}

const cred = loadCredential();
if (!cred) {
  console.error("FIREBASE_ADMIN_JSON 또는 FIREBASE_ADMIN_PATH 필요");
  process.exit(1);
}
if (!process.env.PII_KEK || !/^[0-9a-fA-F]{64}$/.test(process.env.PII_KEK.trim())) {
  console.error("PII_KEK(64 hex) 필요");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(cred) });
}
const db = admin.firestore();

// Dynamic import of project modules after env is set
const { encryptFields, phoneLookupToken, resolveKek } = await import("../lib/server/crypto.js");
const { mintCompanyUserToken } = await import("../lib/server/companyKeys.js");

function piiIdForMatchKey(matchKey) {
  const h = createHash("sha256").update(String(matchKey || ""), "utf8").digest("hex").slice(0, 32);
  return `pii_${h}`;
}

async function upsertVault(matchKey, subjectUserId, fields) {
  resolveKek();
  const piiId = matchKey ? piiIdForMatchKey(matchKey) : null;
  if (!piiId) return "";
  const enc = encryptFields(fields);
  const { version } = resolveKek();
  const ref = db.collection("pii_vault").doc(piiId);
  const snap = await ref.get();
  if (snap.exists) {
    const prev = snap.data() || {};
    await ref.set({
      matchKey,
      subjectUserId: subjectUserId || prev.subjectUserId || "",
      enc: { ...(prev.enc || {}), ...enc },
      keyVersion: version,
      createdAt: prev.createdAt || new Date(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } else {
    await ref.set({
      matchKey,
      subjectUserId: subjectUserId || "",
      enc,
      keyVersion: version,
      createdAt: new Date(),
      updatedAt: new Date().toISOString(),
    });
  }
  return piiId;
}

function hasPlainPii(d) {
  return !!(d.name || d.birth || d.phone || d.license || d.reason
    || d.subjectName || d.subjectBirth || d.subjectPhone
    || d.verified?.name || d.verified?.birth);
}

async function migrateRisks() {
  const snap = await db.collection("risks").get();
  let n = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.piiRef && !hasPlainPii(d)) continue;
    const matchKey = d.matchKey || "";
    const fields = {};
    if (d.name) fields.name = d.name;
    if (d.birth) fields.birth = d.birth;
    if (d.phone) fields.phone = d.phone;
    if (d.license) fields.license = d.license;
    if (d.reason) fields.reason = d.reason;
    if (!Object.keys(fields).length) continue;
    const piiRef = await upsertVault(matchKey, d.subjectUserId || "", fields);
    const patch = {
      piiRef,
      phone_lookup_token: d.phone_lookup_token || phoneLookupToken(d.phone || ""),
      company_user_token: d.company_user_token || (
        d.ownerCompanyId && d.subjectUserId
          ? await mintCompanyUserToken(d.ownerCompanyId, d.subjectUserId)
          : ""
      ),
      name: admin.firestore.FieldValue.delete(),
      birth: admin.firestore.FieldValue.delete(),
      phone: admin.firestore.FieldValue.delete(),
      license: admin.firestore.FieldValue.delete(),
      reason: admin.firestore.FieldValue.delete(),
    };
    await doc.ref.update(patch);
    n += 1;
  }
  console.log(`risks migrated: ${n}`);
}

async function migrateConsents() {
  const snap = await db.collection("consents").get();
  let n = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.piiRef && !d.name && !d.verified?.name) continue;
    const fields = {};
    if (d.name) fields.name = d.name;
    if (d.verified?.birth || d.birth) fields.birth = d.verified?.birth || d.birth;
    if (d.phone) fields.phone = d.phone;
    const piiRef = await upsertVault(d.matchKey || "", d.subjectUserId || "", fields);
    await doc.ref.update({
      piiRef,
      phone_lookup_token: d.phone_lookup_token || phoneLookupToken(d.phone || ""),
      company_user_token: d.company_user_token || (
        d.ownerCompanyId && d.subjectUserId
          ? await mintCompanyUserToken(d.ownerCompanyId, d.subjectUserId)
          : ""
      ),
      photosRef: d.photosRef || { id: d.photos?.id || "", face: d.photos?.face || "" },
      name: admin.firestore.FieldValue.delete(),
      phone: admin.firestore.FieldValue.delete(),
      photos: admin.firestore.FieldValue.delete(),
      verified: {
        method: d.verified?.method || "unknown",
        verifiedAt: d.verified?.verifiedAt || new Date().toISOString(),
      },
    });
    n += 1;
  }
  console.log(`consents migrated: ${n}`);
}

async function migrateCerts() {
  const snap = await db.collection("certificates").get();
  let n = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.piiRef && !d.subjectName) continue;
    const name = d.subjectName || "";
    const birth = d.subjectBirth || "";
    const phone = d.subjectPhone || "";
    const fields = {};
    if (name) fields.name = name;
    if (birth) fields.birth = birth;
    if (phone) fields.phone = phone;
    if (!Object.keys(fields).length) continue;
    const piiRef = await upsertVault(d.matchKey || "", d.subjectUserId || "", fields);
    await doc.ref.update({
      piiRef,
      phone_lookup_token: d.phone_lookup_token || phoneLookupToken(phone),
      company_user_token: d.company_user_token || (
        d.ownerCompanyId && d.subjectUserId
          ? await mintCompanyUserToken(d.ownerCompanyId, d.subjectUserId)
          : ""
      ),
      subjectNameMasked: d.subjectNameMasked || (name ? `${name[0]}${"○".repeat(Math.max(0, name.length - 1))}` : ""),
      subjectBirthMasked: d.subjectBirthMasked || (birth ? `${String(birth).slice(0, 2)}****` : ""),
      subjectName: admin.firestore.FieldValue.delete(),
      subjectBirth: admin.firestore.FieldValue.delete(),
      subjectPhone: admin.firestore.FieldValue.delete(),
    });
    n += 1;
  }
  console.log(`certificates migrated: ${n}`);
}

await migrateRisks();
await migrateConsents();
await migrateCerts();
console.log("done");
