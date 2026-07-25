// Admin 자격 없을 때 서버 메모리 스토어 (시연용). 프로세스 생존 동안만 유지.
import { makeMatchKey } from "./matchKey";
import { cleanBirth } from "@/lib/format";

const g = globalThis;

function seedRisks() {
  return [
    { id: "rk_seed1", matchKey: makeMatchKey("홍길동", "900715"), name: "홍길동", birth: "900715", type: "unpaid", vertical: "rent", license: "31-44-667788-99", phone: "010-5555-1212", company: "스피드렌탈", reason: "대여료 4개월 미납", status: "active", createdAt: Date.now() - 5e8 },
    { id: "rk_seed2", matchKey: makeMatchKey("홍길동", "850228"), name: "홍길동", birth: "850228", type: "accident", vertical: "rent", license: "41-55-778899-00", phone: "010-9090-3434", company: "하나모빌리티", reason: "사고 자기부담금 미정산", status: "active", createdAt: Date.now() - 4e8 },
    { id: "rk_seed3", matchKey: makeMatchKey("최민재", "920909"), name: "최민재", birth: "920909", type: "not_returned", vertical: "rent", license: "51-66-889900-11", phone: "010-1212-3434", company: "국민카대여", reason: "계약만료 후 미반납", status: "active", createdAt: Date.now() - 3e8 },
    { id: "rk_seed4", matchKey: makeMatchKey("김반려", "950101"), name: "김반려", birth: "950101", type: "abandon", vertical: "pet", phone: "010-7777-8888", company: "해피펫분양", reason: "분양 후 유기 신고", status: "active", createdAt: Date.now() - 2e8 },
    { id: "rk_seed5", matchKey: makeMatchKey("박노쇼", "880808"), name: "박노쇼", birth: "880808", type: "noshow", vertical: "dine", phone: "010-3333-4444", company: "맛있는식당", reason: "예약 노쇼 3회", status: "active", createdAt: Date.now() - 1e8 },
  ];
}

function store() {
  if (!g.__rsProStore) g.__rsProStore = {};
  const s = g.__rsProStore;
  if (!Array.isArray(s.risks)) s.risks = seedRisks();
  if (!Array.isArray(s.consents)) s.consents = [];
  if (!Array.isArray(s.audits)) s.audits = [];
  if (!Array.isArray(s.appeals)) s.appeals = [];
  if (!Array.isArray(s.members)) s.members = [];
  if (!Array.isArray(s.certs)) s.certs = [];
  return s;
}

function rid(p) {
  return p + Math.random().toString(36).slice(2, 10);
}

export function mockListRisksByKey(matchKey) {
  return store().risks.filter((r) => r.matchKey === matchKey && r.status === "active");
}

export function mockAddRisk(payload) {
  const row = { id: rid("rk_"), ...payload, createdAt: Date.now() };
  store().risks.unshift(row);
  return row.id;
}

export function mockAddConsent(payload) {
  const id = rid("cs_");
  store().consents.unshift({ id, ...payload, createdAt: Date.now(), completedAt: Date.now() });
  return id;
}

export function mockAddAudit(payload) {
  store().audits.unshift({ id: rid("au_"), ...payload, createdAt: Date.now() });
}

export function mockListAudits(limit = 50) {
  return [...store().audits].slice(0, limit);
}

export function mockResolveByIdentity(name, birth) {
  const b = cleanBirth(birth);
  const key = makeMatchKey(name, birth);
  store().risks.forEach((r) => {
    if (r.status === "active" && (r.matchKey === key || (r.name === name && cleanBirth(r.birth) === b))) {
      r.status = "resolved";
    }
  });
}

export function mockListAllRisks() {
  return [...store().risks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function mockListAppeals() {
  return [...store().appeals].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function mockAddAppeal(payload) {
  const row = { id: rid("ap_"), ...payload, createdAt: Date.now() };
  store().appeals.unshift(row);
  return row.id;
}

export function mockResolveAppeal(appealId, name, birth) {
  const a = store().appeals.find((x) => x.id === appealId);
  if (a) a.status = "resolved";
  mockResolveByIdentity(name, birth);
}

export function mockListConsents(company) {
  const all = [...store().consents].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return company ? all.filter((c) => c.company === company) : all;
}

export function mockAddMember(payload) {
  const id = payload.id || payload.email || rid("mb_");
  if (store().members.some((m) => m.email === payload.email || m.id === id)) {
    const err = new Error("이미 가입된 이메일입니다.");
    err.status = 409;
    throw err;
  }
  const row = { id, ...payload, createdAt: Date.now() };
  store().members.unshift(row);
  return row;
}

export function mockListPendingMembers() {
  return store().members
    .filter((m) => m.status === "pending")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function mockFindMemberByEmail(email) {
  return store().members.find((m) => m.email === email) || null;
}

export function mockFindMemberByCode(code) {
  return store().members.find((m) => m.code === code && m.status === "approved") || null;
}

export function mockApproveMember(id, code) {
  const m = store().members.find((x) => x.id === id);
  if (!m) return null;
  m.status = "approved";
  m.code = code;
  m.approvedAt = Date.now();
  return m;
}

export function mockRejectMember(id) {
  const m = store().members.find((x) => x.id === id);
  if (!m) return null;
  m.status = "rejected";
  m.rejectedAt = Date.now();
  return m;
}
