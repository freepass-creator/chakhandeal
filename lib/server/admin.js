// Firebase Admin 초기화. 자격 없으면 mockStore 사용.
//
// ⚠ firebase-admin v14 는 `admin.apps` · `admin.firestore()` 같은 v9 네임스페이스 API가 없다.
//    모듈별 진입점(`firebase-admin/app` 등)을 써야 한다. 예전 코드가 v9 방식이라
//    자격이 있어도 조용히 mock 으로 떨어지고 있었다(2026-08-09 발견).
import { readFileSync, existsSync } from "fs";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const APP_NAME = "chakhandeal";

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
    const existing = getApps().find((a) => a.name === APP_NAME);
    let app = existing;
    if (!app) {
      const credential = loadCredential();
      if (!credential) {
        _ready = false;
        return { ready: false, db: null, bucket: null };
      }
      app = initializeApp(
        {
          credential: cert(credential),
          storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET || undefined,
          projectId: credential.project_id,
        },
        APP_NAME,
      );
    }

    _db = getFirestore(app);
    try {
      _bucket = getStorage(app).bucket();
    } catch {
      // 버킷 미설정이어도 Firestore 는 쓴다 — 이미지 저장만 로컬로 떨어진다.
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

/** 이미 초기화된 앱 핸들 — 필요할 때만. */
export function adminApp() {
  initAdmin();
  return getApps().find((a) => a.name === APP_NAME) || null;
}
