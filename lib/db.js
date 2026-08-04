// 데이터 접근 — 위험/동의/소명 핵심은 /api/v1/* 서버 경유
import { FB_READY } from "./firebase";
import { cleanBirth, fmtBirth } from "./format";
import { authHeaders } from "./auth";

export { FB_READY };
export const IS_LOCAL = !FB_READY;
export { cleanBirth, fmtBirth };
export { RISK_TYPES } from "./constants";
import { DEMO_MEMBERS } from "./constants";

const LS_C = "rs_consents", LS_R = "rs_risks", LS_A = "rs_appeals";
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } }
function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
function rid(p) { return p + Math.random().toString(36).slice(2, 10); }
function ensureSeed() {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem(LS_R)) {
    lsSet(LS_R, [
      { id: rid("rk_"), name: "홍길동", birth: "900715", type: "unpaid", license: "31-44-667788-99", phone: "010-5555-1212", company: "스피드렌탈", reason: "대여료 4개월 미납", status: "active", createdAt: Date.now() - 5e8 },
      { id: rid("rk_"), name: "홍길동", birth: "850228", type: "accident", license: "41-55-778899-00", phone: "010-9090-3434", company: "하나모빌리티", reason: "사고 자기부담금 미정산", status: "active", createdAt: Date.now() - 4e8 },
      { id: rid("rk_"), name: "최민재", birth: "920909", type: "not_returned", license: "51-66-889900-11", phone: "010-1212-3434", company: "국민카대여", reason: "계약만료 후 미반납", status: "active", createdAt: Date.now() - 3e8 },
      { id: rid("rk_"), name: "김반려", birth: "950101", type: "abandon", vertical: "pet", phone: "010-7777-8888", company: "해피펫분양", reason: "분양 후 유기 신고", status: "active", createdAt: Date.now() - 2e8 },
    ]);
  }
}

export async function findMemberByCode(code) {
  const c = (code || "").trim();
  if (!c) return null;
  try {
    const r = await fetch(`/api/v1/member/by-code?code=${encodeURIComponent(c)}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok && j.member) return j.member;
  } catch { /* fall through */ }
  const demo = DEMO_MEMBERS.find((m) => m.code === c);
  if (demo) return { company: demo.company, code: c, service: demo.service || "", vertical: demo.vertical || "rent" };
  if (IS_LOCAL) {
    const acc = (() => { try { return JSON.parse(localStorage.getItem("rs_accounts") || "{}"); } catch { return {}; } })();
    const fromAcc = Object.values(acc).find((a) => (a.code || "") === c);
    return fromAcc ? { company: fromAcc.company, code: c, service: fromAcc.service || "", vertical: fromAcc.vertical || "rent" } : null;
  }
  return null;
}

export async function createSelfConsent({
  name,
  phone = "",
  company,
  code = "",
  vertical = "",
  verified,
  signed = false,
  photos = null,
  idImage = "",
  faceImage = "",
  identityToken = "",
  agreementKind = "platform_consent",
  contractId = "",
  contractReadThrough = false,
  contractAgreed = false,
} = {}) {
  const r = await fetch("/api/v1/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name, phone, company, code, vertical, verified, signed,
      photos: photos || { id: idImage || "", face: faceImage || "" },
      idImage, faceImage,
      identityToken: identityToken || verified?.identityToken || "",
      agreementKind,
      contractId,
      contractReadThrough,
      contractAgreed,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || "동의 저장 실패");
  if (typeof window !== "undefined") {
    try {
      const arr = lsGet(LS_C);
      arr.unshift({
        id: j.id, name, phone, company, code, status: "completed", verified, signed,
        cert: j.cert, photos, self: true, createdAt: Date.now(), completedAt: Date.now(),
      });
      lsSet(LS_C, arr);
    } catch { /* ignore */ }
  }
  return { id: j.id, cert: j.cert, certId: j.certId || "" };
}

export async function listConsents(company) {
  try {
    const q = company ? `?company=${encodeURIComponent(company)}` : "";
    const r = await fetch(`/api/v1/consents${q}`, { headers: await authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return j.consents || [];
  } catch (e) { console.warn("listConsents API", e); }
  if (IS_LOCAL) {
    const a = lsGet(LS_C).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
    return company ? a.filter((c) => c.company === company) : a;
  }
  return [];
}

export async function addRisk(data) {
  const r = await fetch("/api/v1/register", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: data.name,
      birth: cleanBirth(data.birth),
      type: data.type,
      vertical: data.vertical || "rent",
      license: data.license || "",
      phone: data.phone || "",
      reason: data.reason || "",
      evidence: data.evidence || "",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || "등록 실패");
  return j.id;
}

export async function listRisks() {
  try {
    const r = await fetch("/api/v1/admin/risks", { headers: await authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return j.risks || [];
  } catch (e) { console.warn("listRisks API", e); }
  if (IS_LOCAL) {
    ensureSeed();
    return lsGet(LS_R).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return [];
}

export async function queryRisk({ identityToken, vertical = "" }) {
  const r = await fetch("/api/v1/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identityToken, vertical }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) {
    console.error("queryRisk failed", j);
    return { kind: "none", records: [], exists: false, types: [], ambiguous: false };
  }
  return {
    kind: j.kind || (j.exists ? "hit" : "none"),
    records: j.records || [],
    exists: !!j.exists,
    types: j.types || [],
    ambiguous: !!j.ambiguous,
  };
}

export async function createAppeal({ name, birth, type = "", note = "", channel = "self" }) {
  const r = await fetch("/api/v1/appeals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, birth: cleanBirth(birth), type, note, channel }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) {
    if (IS_LOCAL) {
      const arr = lsGet(LS_A);
      arr.unshift({ id: rid("ap_"), name, birth: cleanBirth(birth), type, note, channel, status: "pending", createdAt: Date.now() });
      lsSet(LS_A, arr);
      return;
    }
    throw new Error(j.error || "소명 접수 실패");
  }
}

export async function listAppeals() {
  try {
    const r = await fetch("/api/v1/admin/appeals", { headers: await authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return j.appeals || [];
  } catch (e) { console.warn("listAppeals API", e); }
  if (IS_LOCAL) return lsGet(LS_A).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return [];
}

export async function resolveAppeal(appeal) {
  const r = await fetch("/api/v1/admin/appeals", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "resolve", appeal }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || "해제 처리 실패");
}
