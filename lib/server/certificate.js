// 검증 기록 — 본인만 생성, 특정 상대에게 링크로 전달 (검색 API 아님 · 다운로드 증명서 아님)
import { checkRiskByKey, filterRecordsByVertical } from "./risks";
import { getAdmin } from "./admin";
import { writeAudit } from "./audit";
import { getVertical } from "@/lib/constants";
import { cleanBirth } from "@/lib/format";
import { companyIdForCode, CID_TEST_RENT, CID_PET, UID_CLEAN, UID_HIT, UID_PET_HIT } from "./ids";
import { makeMatchKey } from "./matchKey";
import { upsertPiiVault, piiIdForMatchKey } from "./piiVault";
import { mintCompanyUserToken } from "./companyKeys";
import {
  phoneLookupToken,
  encryptFields,
  resolveKek,
  companyUserToken,
  deriveCompanyKeyMaterial,
} from "./crypto";

const g = globalThis;
if (!g.__rsProStore) g.__rsProStore = {};
if (!g.__rsProStore.certs) g.__rsProStore.certs = [];

function rid() {
  return "CT" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function maskName(name) {
  const n = String(name || "");
  if (!n) return "";
  return `${n[0]}${"○".repeat(Math.max(0, n.length - 1))}`;
}

function maskBirth(birth) {
  const b = cleanBirth(birth);
  return b ? `${b.slice(0, 2)}****` : "";
}

export async function buildCertificateDraft({ matchKey = "", name = "", birth = "", vertical = "rent", method = "" } = {}) {
  const v = getVertical(vertical);
  const key = matchKey || makeMatchKey(name, birth);
  if (!key) throw Object.assign(new Error("본인확인 정보가 올바르지 않습니다."), { status: 400 });
  const q = await checkRiskByKey(key, { actor: "self-cert" });
  const hits = filterRecordsByVertical(q.records, vertical);
  const serious = hits.length;
  const hasHistory = hits.length > 0;
  const isNew = !hasHistory;

  return {
    certNo: rid(),
    vertical,
    certName: v.certName,
    brandEn: v.brandEn,
    identityVerified: true,
    method: method || "본인확인",
    status: isNew ? "new" : "history",
    score: null,
    scoreLabel: null,
    trustLevel: isNew ? "신규" : "기록 있음",
    summary: {
      confirmedAdoptionsOrDeals: isNew ? 0 : hits.length,
      updateFulfillment: null,
      seriousBreaches: serious,
      appealsOpen: 0,
    },
    negativeHistory: serious > 0,
    notice: isNew
      ? "이력이 없으면 신규·본인확인 완료로 표시됩니다. 불리한 의미가 아닙니다."
      : "아래에 확인된 사실 요약이 포함됩니다. 보내기 전 내용을 직접 확인해 주세요.",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    _internalTypes: hits.map((r) => r.type),
  };
}

/** 건별 제출 — subject PII → vault, 가명 레코드만 저장 */
export async function submitCertificate({ draft, provider, subject, signed = false }) {
  const id = rid();
  const publicCert = { ...draft };
  delete publicCert._internalTypes;

  const ownerCompanyId = provider.companyId || companyIdForCode(provider.code) || "";
  const subjectUserId = subject.userId || "";
  const matchKey = subject.matchKey || makeMatchKey(subject.name, subject.birth) || "";
  const name = subject.name || "";
  const birth = cleanBirth(subject.birth);
  const phone = subject.phone || "";

  const piiRef = matchKey
    ? await upsertPiiVault({
      matchKey,
      subjectUserId,
      fields: { name, birth, phone },
    })
    : "";

  const row = {
    id,
    ...publicCert,
    providerCode: provider.code,
    providerCompany: provider.company,
    subjectNameMasked: maskName(name),
    subjectBirthMasked: maskBirth(birth),
    method: subject.method || draft.method,
    signed: !!signed,
    submittedAt: new Date().toISOString(),
    status: "submitted",
    ownerCompanyId,
    subjectUserId,
    matchKey,
    piiRef,
    phone_lookup_token: phoneLookupToken(phone),
    company_user_token: ownerCompanyId && subjectUserId
      ? await mintCompanyUserToken(ownerCompanyId, subjectUserId)
      : "",
  };

  const { ready, db } = getAdmin();
  if (ready) {
    await db.collection("certificates").doc(id).set({ ...row, createdAt: new Date() });
  } else {
    g.__rsProStore.certs.unshift(row);
  }

  await writeAudit({
    action: "cert_issue",
    actor: subjectUserId || "subject",
    meta: { id, vertical: draft.vertical, provider: provider.company, status: draft.status, channel: "kakao_sms_share", ownerCompanyId, subjectUserId },
  });

  return { id, cert: row };
}

export async function getCertificate(id, { auditView = false, actor = "link" } = {}) {
  const { ready, db } = getAdmin();
  let cert = null;
  if (ready) {
    const snap = await db.collection("certificates").doc(id).get();
    if (snap.exists) cert = { id: snap.id, ...snap.data() };
  } else {
    ensureDemoCerts();
    cert = g.__rsProStore.certs.find((c) => c.id === id) || null;
  }
  if (!cert) return null;
  if (cert.expiresAt && new Date(cert.expiresAt).getTime() < Date.now()) {
    return { ...cert, expired: true };
  }
  if (auditView) {
    await writeAudit({
      action: "cert_view",
      actor,
      meta: { id: cert.id, matchKeyPrefix: cert.matchKey ? String(cert.matchKey).slice(0, 8) : "" },
    });
  }
  return cert;
}

export async function listCertificatesForProvider({ company, code, companyId } = {}) {
  const { ready, db } = getAdmin();
  const match = (c) =>
    (companyId && c.ownerCompanyId === companyId) ||
    (company && c.providerCompany === company) ||
    (code && c.providerCode === code);

  if (ready) {
    let rows = [];
    const seen = new Set();
    const push = (list) => {
      list.forEach((r) => {
        if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
      });
    };
    if (companyId) {
      try {
        const snap = await db.collection("certificates").where("ownerCompanyId", "==", companyId).get();
        push(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch { /* index 없을 수 있음 */ }
    }
    if (company) {
      const snap = await db.collection("certificates").where("providerCompany", "==", company).get();
      push(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    if (code) {
      const snap = await db.collection("certificates").where("providerCode", "==", code).get();
      push(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    return rows.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
  }

  ensureDemoCerts();
  return g.__rsProStore.certs.filter(match)
    .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
}

/** DEMO — vault+가명 구조 시드 (평문 미보관) */
function ensureDemoCerts() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") return;
  if (!g.__rsProStore) g.__rsProStore = {};
  if (!Array.isArray(g.__rsProStore.certs)) g.__rsProStore.certs = [];
  if (g.__rsProStore._demoCerts) return;
  g.__rsProStore._demoCerts = true;

  // 동기 시드: vault에 봉투암호문만 보관(평문 미보관)
  resolveKek();
  if (!(g.__rsProStore.pii instanceof Map)) g.__rsProStore.pii = new Map();

  function seedPerson({ name, birth, phone, userId }) {
    const mk = makeMatchKey(name, birth);
    const piiId = piiIdForMatchKey(mk);
    const { version } = resolveKek();
    g.__rsProStore.pii.set(piiId, {
      matchKey: mk,
      subjectUserId: userId,
      enc: encryptFields({ name, birth, phone }),
      keyVersion: version,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { mk, piiId, plt: phoneLookupToken(phone) };
  }

  const clean = seedPerson({ name: "김신규", birth: "950101", phone: "010-1234-5678", userId: UID_CLEAN });
  const hit = seedPerson({ name: "홍길동", birth: "900715", phone: "010-5555-1212", userId: UID_HIT });
  const pet = seedPerson({ name: "김반려", birth: "950101", phone: "010-7777-8888", userId: UID_PET_HIT });
  const keyRent = deriveCompanyKeyMaterial(CID_TEST_RENT);
  const keyPet = deriveCompanyKeyMaterial(CID_PET);

  const now = Date.now();
  const samples = [
    {
      id: "CTDEMO01NEW",
      providerCode: "1001",
      providerCompany: "테스트렌탈",
      ownerCompanyId: CID_TEST_RENT,
      subjectUserId: UID_CLEAN,
      subjectNameMasked: maskName("김신규"),
      subjectBirthMasked: maskBirth("950101"),
      matchKey: clean.mk,
      piiRef: clean.piiId,
      phone_lookup_token: clean.plt,
      company_user_token: companyUserToken(keyRent, UID_CLEAN),
      trustLevel: "신규",
      certName: "렌탈 상태 검증",
      identityVerified: true,
      method: "신분증 + 얼굴 대조",
      summary: { confirmedAdoptionsOrDeals: 0, seriousBreaches: 0, appealsOpen: 0 },
      notice: "이력이 없으면 신규·본인확인 완료로 표시됩니다. 불리한 의미가 아닙니다.",
      submittedAt: new Date(now - 3600_000).toISOString(),
      issuedAt: new Date(now - 3600_000).toISOString(),
      expiresAt: new Date(now + 7 * 86400_000).toISOString(),
      status: "submitted",
      signed: true,
      vertical: "rent",
    },
    {
      id: "CTDEMO01HIT",
      providerCode: "1001",
      providerCompany: "테스트렌탈",
      ownerCompanyId: CID_TEST_RENT,
      subjectUserId: UID_HIT,
      subjectNameMasked: maskName("홍길동"),
      subjectBirthMasked: maskBirth("900715"),
      matchKey: hit.mk,
      piiRef: hit.piiId,
      phone_lookup_token: hit.plt,
      company_user_token: companyUserToken(keyRent, UID_HIT),
      trustLevel: "기록 있음",
      certName: "렌탈 상태 검증",
      identityVerified: true,
      method: "신분증 + 얼굴 대조",
      summary: { confirmedAdoptionsOrDeals: 1, seriousBreaches: 1, appealsOpen: 0 },
      notice: "아래에 확인된 사실 요약이 포함됩니다. 보내기 전 내용을 직접 확인해 주세요.",
      submittedAt: new Date(now - 7200_000).toISOString(),
      issuedAt: new Date(now - 7200_000).toISOString(),
      expiresAt: new Date(now + 7 * 86400_000).toISOString(),
      status: "submitted",
      signed: true,
      vertical: "rent",
      negativeHistory: true,
    },
    {
      id: "CTDEMO02PET",
      providerCode: "2001",
      providerCompany: "해피펫분양",
      ownerCompanyId: CID_PET,
      subjectUserId: UID_PET_HIT,
      subjectNameMasked: maskName("김반려"),
      subjectBirthMasked: maskBirth("950101"),
      matchKey: pet.mk,
      piiRef: pet.piiId,
      phone_lookup_token: pet.plt,
      company_user_token: companyUserToken(keyPet, UID_PET_HIT),
      trustLevel: "기록 있음",
      certName: "책임입양 검증",
      identityVerified: true,
      method: "휴대폰 본인인증",
      summary: { confirmedAdoptionsOrDeals: 1, seriousBreaches: 1, appealsOpen: 0 },
      notice: "아래에 확인된 사실 요약이 포함됩니다.",
      submittedAt: new Date(now - 5400_000).toISOString(),
      issuedAt: new Date(now - 5400_000).toISOString(),
      expiresAt: new Date(now + 7 * 86400_000).toISOString(),
      status: "submitted",
      signed: true,
      vertical: "pet",
      negativeHistory: true,
    },
  ];
  samples.forEach((s) => {
    if (!g.__rsProStore.certs.some((c) => c.id === s.id)) g.__rsProStore.certs.push(s);
  });
}
