// Firebase Admin 초기화. 자격 없으면 mockStore 사용.
import { readFileSync, existsSync } from "fs";
import admin from "firebase-admin";

let _db = null;
let _bucket = null;
let _ready = null;

function loadCredential() {
  const json = process.env.FIREBASE_ADMIN_JSON;
  if (json) {
    try {
      return JSON.parse(json);
    } catch {
      /* fall through */
    }
  }
  const path = process.env.FIREBASE_ADMIN_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8"));
  }
  return null;
}

export function getAdmin() {
  if (_ready !== null) return { ready: _ready, db: _db, bucket: _bucket };

  try {
    if (!admin.apps.length) {
      const cred = loadCredential();
      if (!cred) {
        _ready = false;
        return { ready: false, db: null, bucket: null };
      }
      admin.initializeApp({
        credential: admin.credential.cert(cred),
        storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET || undefined,
      });
    }
    _db = admin.firestore();
    try {
      _bucket = admin.storage().bucket();
    } catch {
      _bucket = null;
    }
    _ready = true;
  } catch (e) {
    console.warn("[chakhandeal] Admin 미사용 — mock 스토어로 동작:", e?.message || e);
    _ready = false;
  }
  return { ready: _ready, db: _db, bucket: _bucket };
}

export function adminReady() {
  return getAdmin().ready;
}
