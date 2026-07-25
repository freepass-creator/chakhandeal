// 인증 — Firebase Auth(설정 시) + localStorage mock 폴백
// 회원 프로필은 Firestore members/{uid}. 가입은 '승인제': status pending → 관리자 승인 → approved + 거래코드 발급.
import { auth, db, FB_READY } from "./firebase";
import { putImage } from "./storage";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, query, where, getDocs, orderBy,
} from "firebase/firestore";

// 운영자 화이트리스트 — 항상 승인됨
const BUILTIN = {
  "dudguq@gmail.com": { company: "착한거래 관리자", role: "admin", code: "", status: "approved" },
  "test@test.com":    { company: "테스트렌탈", role: "member", code: "1001", status: "approved", vertical: "rent" },
  "pet@test.com":     { company: "해피펫분양", role: "member", code: "2001", status: "approved", vertical: "pet" },
};

// 거래코드 발급 — 4자리 숫자 (1만개)
function genCode() {
  let r = "";
  for (let i = 0; i < 4; i++) r += Math.floor(Math.random() * 10);
  return r;
}

const MOCK_PW = { "dudguq@gmail.com": "1234", "test@test.com": "test1234", "pet@test.com": "test1234" };

const ACCT_KEY = "rs_accounts";
const SESSION_KEY = "rs_session";
const TOKEN_KEY = "rs_access_token";

function loadAccounts() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(ACCT_KEY) || "{}"); } catch { return {}; }
}
function saveAccounts(a) { localStorage.setItem(ACCT_KEY, JSON.stringify(a)); }
function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); return s; }
function setToken(t) {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

/** API Authorization 헤더용 토큰 (Firebase ID 또는 데모 HMAC) */
export async function getAccessToken() {
  if (typeof window === "undefined") return null;
  if (FB_READY && auth?.currentUser) {
    try { return await auth.currentUser.getIdToken(); } catch { /* fall through */ }
  }
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export async function authHeaders(extra = {}) {
  const token = await getAccessToken();
  const h = { ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function resolveProfile(uid, email) {
  try {
    const snap = await getDoc(doc(db, "members", uid));
    if (snap.exists()) { const d = snap.data(); return { company: d.company, role: d.role || "member", code: d.code || "", status: d.status || "approved", vertical: d.vertical || "rent", service: d.service || "" }; }
  } catch { /* 기본값 */ }
  return BUILTIN[email] || { company: email.split("@")[0], role: "member", code: "", status: "approved" };
}

export async function login(email, pw) {
  const e = (email || "").trim().toLowerCase();
  if (FB_READY) {
    try {
      const cred = await signInWithEmailAndPassword(auth, e, pw);
      const p = await resolveProfile(cred.user.uid, e);
      const token = await cred.user.getIdToken();
      setToken(token);
      return setSession({ uid: cred.user.uid, email: e, company: p.company, role: p.role, code: p.code, status: p.status, vertical: p.vertical || "rent" });
    } catch {
      return null;
    }
  }
  // 데모 — 서버에서 HMAC 토큰 발급
  try {
    const r = await fetch("/api/v1/auth/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e, pw }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok && j.token && j.session) {
      setToken(j.token);
      return setSession({ ...j.session, email: e });
    }
  } catch { /* fall through to local mock */ }
  const acc = loadAccounts()[e];
  if (acc && acc.pw === pw) {
    // 로컬 가입 계정 — 서버 미발급 시 이슈 API가 빌트인만 허용. 일단 세션만.
    return setSession({ email: e, company: acc.company, role: acc.role || "member", code: acc.code || "", status: acc.status || "approved", vertical: acc.vertical || "rent" });
  }
  if (MOCK_PW[e] && MOCK_PW[e] === pw) {
    // 토큰 없이 세션만 두면 거래상태 API가 401 — 이슈 API 재시도
    try {
      const r = await fetch("/api/v1/auth/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok && j.token && j.session) {
        setToken(j.token);
        return setSession({ ...j.session, email: e });
      }
    } catch { /* fall through */ }
    const b = BUILTIN[e];
    return setSession({ email: e, ...b });
  }
  return null;
}

// 회원사 가입(승인제) — 사업자등록증 + 대표자 신분증 첨부, status: pending
export async function signup({ company, email, pw, bizImage, ceoIdImage, service = "", bizNo = "", ceo = "", industry = "", vertical = "rent" }) {
  const e = (email || "").trim().toLowerCase();
  if (!company?.trim() || !e || !pw) return { error: "회사명·이메일·비밀번호를 입력해 주세요." };
  if (!bizImage) return { error: "사업자등록증을 첨부해 주세요." };
  if (!ceoIdImage) return { error: "대표자 신분증을 첨부해 주세요." };
  const profile = {
    company: company.trim(), email: e, role: "member", code: "", service: service.trim(),
    vertical: vertical || "rent",
    bizNo, ceo, industry, status: "pending", bizImage, ceoIdImage,
  };
  if (FB_READY) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, e, pw);
      const uid = cred.user.uid;
      const bizUrl = await putImage(`members/${uid}/biz`, bizImage);
      const ceoUrl = await putImage(`members/${uid}/ceo_id`, ceoIdImage);
      await setDoc(doc(db, "members", uid), { ...profile, bizImage: bizUrl, ceoIdImage: ceoUrl, createdAt: serverTimestamp() });
      await signOut(auth).catch(() => {});
      return { pending: true };
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") return { error: "이미 가입된 이메일입니다." };
      if (code === "auth/weak-password") return { error: "비밀번호는 6자 이상이어야 합니다." };
      if (code === "auth/invalid-email") return { error: "이메일 형식이 올바르지 않습니다." };
      return { error: "가입 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
    }
  }
  // 데모 — 서버 mock members + 로컬 계정 미러
  try {
    const r = await fetch("/api/v1/members/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile, pw }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { error: j.error || "가입 실패" };
  } catch {
    return { error: "가입 중 오류가 발생했습니다." };
  }
  const acc = loadAccounts();
  acc[e] = { pw, ...profile, createdAt: Date.now() };
  saveAccounts(acc);
  return { pending: true };
}

// ── 회원사 승인 (관리자) — Admin API 우선 ──
export async function listPendingMembers() {
  try {
    const r = await fetch("/api/v1/admin/members", { headers: await authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return j.members || [];
  } catch { /* fall through */ }
  if (FB_READY) {
    try {
      const snap = await getDocs(query(collection(db, "members"), where("status", "==", "pending")));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    } catch { return []; }
  }
  const acc = loadAccounts();
  return Object.entries(acc).filter(([, v]) => (v.status || "approved") === "pending")
    .map(([email, v]) => ({ id: email, email, ...v })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function approveMember(id) {
  const r = await fetch("/api/v1/admin/members", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "approve", id }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.ok) {
    const code = j.code;
    const acc = loadAccounts();
    if (acc[id]) { acc[id].status = "approved"; acc[id].code = code; saveAccounts(acc); }
    return code;
  }
  if (FB_READY) {
    const code = genCode();
    await updateDoc(doc(db, "members", id), { status: "approved", code, approvedAt: serverTimestamp() });
    return code;
  }
  throw new Error(j.error || "승인 실패");
}

export async function rejectMember(id) {
  const r = await fetch("/api/v1/admin/members", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "reject", id }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.ok) {
    const acc = loadAccounts();
    if (acc[id]) { acc[id].status = "rejected"; saveAccounts(acc); }
    return;
  }
  if (FB_READY) {
    await updateDoc(doc(db, "members", id), { status: "rejected", rejectedAt: serverTimestamp() });
    return;
  }
  throw new Error(j.error || "반려 실패");
}

export async function listAudits(limit = 50) {
  const r = await fetch(`/api/v1/admin/audits?limit=${limit}`, { headers: await authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) return [];
  return j.audits || [];
}

export async function resetPassword(email) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return { error: "이메일을 입력해 주세요." };
  if (!FB_READY) return { error: "데모 모드에서는 비밀번호 재설정 메일을 보낼 수 없습니다." };
  try {
    await sendPasswordResetEmail(auth, e);
    return { ok: true };
  } catch (err) {
    if (err?.code === "auth/user-not-found") return { error: "가입되지 않은 이메일입니다." };
    if (err?.code === "auth/invalid-email") return { error: "이메일 형식이 올바르지 않습니다." };
    return { error: "메일 발송 중 오류가 발생했습니다." };
  }
}

export function getSession() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

export async function logout() {
  if (FB_READY) { try { await signOut(auth); } catch { /* 무시 */ } }
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
}
