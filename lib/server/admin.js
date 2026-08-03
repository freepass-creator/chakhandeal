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

function initAdmin() {
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

export function getAdmin() {
  const r = initAdmin();
  // 운영(DEMO 끔)인데 Firebase Admin 자격이 없으면 즉시 실패 — mock 가공 데이터를 실판정으로 서빙 금지.
  if (!r.ready
    && process.env.NEXT_PUBLIC_DEMO_MODE === "false"
    && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("[착한거래] 운영 모드인데 Firebase Admin 자격이 없습니다. FIREBASE_ADMIN_JSON을 설정하세요.");
  }
  return r;
}

export function adminReady() {
  return initAdmin().ready;
}
