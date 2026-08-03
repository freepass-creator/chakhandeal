// 서버 세션 — Firebase ID 토큰 또는 데모 HMAC 토큰
import { createHmac, timingSafeEqual } from "crypto";
import { getAdmin } from "./admin";
import admin from "firebase-admin";
import { hmacSecret } from "./matchKey";

const DEMO_PREFIX = "demo.";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function secret() {
  return hmacSecret();
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function fromB64url(s) {
  return Buffer.from(s, "base64url").toString("utf8");
}

export function issueDemoToken(actor) {
  const payload = {
    uid: actor.uid || actor.email,
    email: actor.email,
    company: actor.company || "",
    role: actor.role || "member",
    code: actor.code || "",
    status: actor.status || "approved",
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${DEMO_PREFIX}${body}.${sig}`;
}

export function verifyDemoToken(token) {
  if (!token?.startsWith(DEMO_PREFIX)) return null;
  const raw = token.slice(DEMO_PREFIX.length);
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const body = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expect = createHmac("sha256", secret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(fromB64url(body));
  } catch {
    return null;
  }
  if (!payload?.email || !payload.exp || payload.exp < Date.now()) return null;
  return {
    uid: payload.uid || payload.email,
    email: payload.email,
    company: payload.company || "",
    role: payload.role || "member",
    code: payload.code || "",
    status: payload.status || "approved",
    demo: true,
  };
}

async function verifyFirebaseToken(token) {
  const { ready, db } = getAdmin();
  if (!ready) return null;
  try {
    if (!admin.apps.length) getAdmin();
    const decoded = await admin.auth().verifyIdToken(token);
    const email = (decoded.email || "").toLowerCase();
    let profile = { company: email.split("@")[0], role: "member", code: "", status: "approved" };
    if (email === "dudguq@gmail.com") {
      profile = { company: "착한딜 관리자", role: "admin", code: "", status: "approved" };
    }
    try {
      const snap = await db.collection("members").doc(decoded.uid).get();
      if (snap.exists) {
        const d = snap.data();
        profile = {
          company: d.company || profile.company,
          role: d.role || profile.role,
          code: d.code || "",
          status: d.status || "approved",
        };
      }
    } catch { /* use defaults */ }
    return {
      uid: decoded.uid,
      email,
      company: profile.company,
      role: profile.role,
      code: profile.code,
      status: profile.status,
      demo: false,
    };
  } catch {
    return null;
  }
}

/** Authorization: Bearer <token> → actor or null */
export async function resolveActor(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  if (token.startsWith(DEMO_PREFIX)) return verifyDemoToken(token);
  return verifyFirebaseToken(token);
}

export function requireActor(actor, { roles } = {}) {
  if (!actor) {
    const e = new Error("인증이 필요합니다.");
    e.status = 401;
    throw e;
  }
  if (actor.status && actor.status !== "approved") {
    const e = new Error("승인된 회원만 이용할 수 있습니다.");
    e.status = 403;
    throw e;
  }
  if (roles?.length && !roles.includes(actor.role)) {
    const e = new Error("권한이 없습니다.");
    e.status = 403;
    throw e;
  }
  return actor;
}
