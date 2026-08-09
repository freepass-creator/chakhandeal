/**
 * 보관기간 · 파기 — 개인정보보호법 §21(목적 달성 시 지체 없이 파기).
 *
 * 넣기만 하고 지우는 경로가 없으면 «보유기간 초과 보관»이 되고, 그 자체가 위반이다.
 * 동의서에 적은 기간과 코드가 지우는 시점이 **같아야** 한다 — 다르면 동의 범위를 넘는다.
 *
 * ── 기간 (2026-08-09 사장님 확정) ───────────────────────────────
 *   계약 데이터 · 주민등록번호 : 계약기간 중 + **계약 종료 후 5년**
 *     근거 = 수집 목적이 「부가가치세법 §32② 세금계산서 발행」이므로
 *            증빙 보존기간(국세기본법 §85-3, 5년)이 곧 보유기간이다.
 *   신분증 · 얼굴 촬영본 : 본인확인 목적 달성 후. 계약 증적이므로 계약과 같이 본다.
 *
 * ── 무엇을 지우고 무엇을 남기나 ────────────────────────────────
 *   지운다 : 주민번호·이름·주소 등 PII, 신분증·얼굴·서류 이미지, 손님 입력값
 *   남긴다 : 계약 존재 사실 — 계약번호·봉인해시·검증번호·서명 시각·회원사
 *            (개인을 식별하지 않으므로 파기 대상이 아니고, 계약 증명에 필요하다)
 */

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** 계약 종료 후 보존기간 — 세금계산서 증빙 5년. */
export const RETENTION_AFTER_END_MS = 5 * YEAR_MS;

/**
 * 파기 예정일.
 * 계약종료일을 모르면(인도 전이라 기산점이 없다) **서명일 + 대여기간 + 5년**으로 잡는다.
 * 인도 후 계약종료일이 확정되면 다시 계산해 늘린다.
 */
export function computePurgeAt(inst, { now = Date.now() } = {}) {
  const signedAt = Number(inst?.signedAt) || now;
  const months = Number(inst?.data?.rent_month_snapshot)
    || Number(String(inst?.atoms?.sections?.find?.((s) => s.key === "rental")?.rows?.find?.((r) => r.label === "대여기간")?.value || "").replace(/\D/g, ""))
    || 0;
  const termMs = months > 0 ? months * 30 * 24 * 60 * 60 * 1000 : 0;
  const endAt = Number(inst?.contractEndAt) || (signedAt + termMs);
  return endAt + RETENTION_AFTER_END_MS;
}

/** 파기 대상인가. */
export function isPurgeDue(inst, { now = Date.now() } = {}) {
  if (!inst || inst.purgedAt) return false;
  const at = Number(inst.purgeAt);
  return Number.isFinite(at) && at > 0 && now >= at;
}

/** 파기 후에도 남는 «계약 존재 사실»만 추린다. */
export function toPurgedRecord(inst, { now = Date.now() } = {}) {
  return {
    contractId: inst.contractId,
    memberCompany: inst.memberCompany || "",
    externalRef: inst.externalRef || "",
    status: "purged",
    signedAt: inst.signedAt || null,
    sealHash: inst.sealHash || "",
    verifyNo: inst.verifyNo || "",
    issuedAt: inst.issuedAt || null,
    purgeAt: inst.purgeAt || null,
    purgedAt: now,
    // 개인을 식별할 수 있는 것은 남기지 않는다.
    purgedFields: [
      "signer", "consentPages", "consentGroups", "inputs", "acks", "consentAtoms",
      "atoms", "a4", "certificate", "documents", "identity", "signaturePath",
      "subjectUserId", "matchKey", "data",
    ],
  };
}
