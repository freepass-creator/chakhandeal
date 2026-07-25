// 검증 기록 — 본인만 생성, 특정 상대에게 링크로 전달 (검색 API 아님 · 다운로드 증명서 아님)
import { checkRisk, filterRecordsByVertical } from "./risks";
import { getAdmin } from "./admin";
import { writeAudit } from "./audit";
import { getVertical } from "@/lib/constants";
import { cleanBirth } from "@/lib/format";

const g = globalThis;
if (!g.__rsProStore) g.__rsProStore = {};
if (!g.__rsProStore.certs) g.__rsProStore.certs = [];

function rid() {
  return "CT" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

/**
 * 검증 링크용 초안 (생성 전 미리보기). 사업자가 타인을 조회하는 API가 아님.
 */
export async function buildCertificateDraft({ name, birth, vertical = "rent", method = "" }) {
  const v = getVertical(vertical);
  const q = await checkRisk({ name, birth, actor: "self-cert" });
  const hits = filterRecordsByVertical(q.records, vertical);
  // 중대 확정만 — 현재 MVP는 active hit 건수를 확정 위반으로 표기(고도화 시 확정 플래그 분리)
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
    // 내부용(응답에서 제공자 미리보기에선 제거)
    _internalTypes: hits.map((r) => r.type),
  };
}

/** 건별 제출 — providerCode 대상에게만 열람 가능 */
export async function submitCertificate({ draft, provider, subject, signed = false }) {
  const id = rid();
  const publicCert = { ...draft };
  delete publicCert._internalTypes;

  const row = {
    id,
    ...publicCert,
    providerCode: provider.code,
    providerCompany: provider.company,
    subjectName: subject.name,
    subjectBirth: cleanBirth(subject.birth),
    subjectPhone: subject.phone || "",
    method: subject.method || draft.method,
    signed: !!signed,
    submittedAt: new Date().toISOString(),
    status: "submitted",
  };

  const { ready, db } = getAdmin();
  if (ready) {
    await db.collection("certificates").doc(id).set({ ...row, createdAt: new Date() });
  } else {
    g.__rsProStore.certs.unshift(row);
  }

  await writeAudit({
    action: "cert_issue",
    actor: subject.name,
    meta: { id, vertical: draft.vertical, provider: provider.company, status: draft.status, channel: "kakao_sms_share" },
  });

  return { id, cert: row };
}

export async function getCertificate(id) {
  const { ready, db } = getAdmin();
  let cert = null;
  if (ready) {
    const snap = await db.collection("certificates").doc(id).get();
    if (snap.exists) cert = { id: snap.id, ...snap.data() };
  } else {
    cert = g.__rsProStore.certs.find((c) => c.id === id) || null;
  }
  if (!cert) return null;
  if (cert.expiresAt && new Date(cert.expiresAt).getTime() < Date.now()) {
    return { ...cert, expired: true };
  }
  return cert;
}

export async function listCertificatesForProvider({ company, code } = {}) {
  const { ready, db } = getAdmin();
  const match = (c) =>
    (company && c.providerCompany === company) ||
    (code && c.providerCode === code);

  if (ready) {
    let rows = [];
    if (company) {
      const snap = await db.collection("certificates").where("providerCompany", "==", company).get();
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    if (code) {
      const snap = await db.collection("certificates").where("providerCode", "==", code).get();
      const extra = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const seen = new Set(rows.map((r) => r.id));
      extra.forEach((r) => { if (!seen.has(r.id)) rows.push(r); });
    }
    return rows.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
  }

  // 시연: 서버리스에서 메모리가 비면 회원사별 샘플 거래상태를 채워 콘솔에서 확인 가능하게
  ensureDemoCerts();
  return g.__rsProStore.certs.filter(match)
    .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
}

/** DEMO — 테스트렌탈·해피펫분양에 샘플 거래상태 1회 시드 */
function ensureDemoCerts() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") return;
  if (!g.__rsProStore) g.__rsProStore = {};
  if (!Array.isArray(g.__rsProStore.certs)) g.__rsProStore.certs = [];
  if (g.__rsProStore._demoCerts) return;
  g.__rsProStore._demoCerts = true;

  const now = Date.now();
  const samples = [
    {
      id: "CTDEMO01NEW",
      providerCode: "1001",
      providerCompany: "테스트렌탈",
      subjectName: "김신규",
      subjectBirth: "950101",
      subjectPhone: "010-1234-5678",
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
      subjectName: "홍길동",
      subjectBirth: "900715",
      subjectPhone: "010-5555-1212",
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
      subjectName: "김반려",
      subjectBirth: "950101",
      subjectPhone: "010-7777-8888",
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
