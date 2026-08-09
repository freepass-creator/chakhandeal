import { createHash } from "crypto";

/**
 * 서명된 계약을 «세 형태»로 굳힌다.
 *
 *   ① atoms       원자용 — 정본. 섹션·항목·값·확인시각·동의·서명 경로. **봉인 대상**
 *   ② a4          A4용   — 사람이 읽는 계약서. 당사자(본인 + 발행 회원사)만
 *   ③ certificate 증명서용 — 제3자(`/v?id=`)에게 나가는 사실 요약. 금액·PII 없음
 *
 * 정본은 ①이다. ②·③은 파생이지만 **함께 저장**한다 —
 * ②는 「그때 손님이 본 문서」의 증거이고, ③은 제3자 열람 때 원자를 열지 않기 위해서다.
 * ③에 «무엇을 뺐는지»를 적어 두는 것도 중요하다. 나중에 슬그머니 늘어나는 걸 막는다.
 *
 * **입력은 계약 인스턴스 하나뿐이다.** 손님 브라우저가 보낸 상태를 믿지 않는다 —
 * 확인 시각·제출 시각·파일 해시는 전부 서버가 기록한 값이다.
 */

const S = (v) => String(v ?? "").trim();

/** 키 순서·공백에 따라 해시가 흔들리면 봉인이 아니다. */
export function canonical(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${k}:${canonical(value[k])}`).join(",")}}`;
  }
  return String(value);
}

/** 제3자에게 실명 원문을 그대로 주지 않는다. */
export function maskName(name) {
  const n = S(name);
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${"*".repeat(n.length - 2)}${n[n.length - 1]}`;
}

export function buildContractRecord(inst, { now = Date.now() } = {}) {
  const pages = Array.isArray(inst.consentPages) && inst.consentPages.length
    ? inst.consentPages
    : (inst.consentGroups || []);
  const inputGroups = inst.inputGroups || [];
  const consentAtoms = inst.consentAtoms || [];
  const requiredDocs = inst.requiredDocs || [];
  const agreement = inst.agreement || {};
  const consents = inst.consents || {};
  const values = inst.inputs || {};
  const acks = inst.acks || {};

  /* ── ① 원자용 — 정본 ─────────────────────────── */
  const atoms = {
    contractId: inst.contractId,
    memberCompany: S(inst.memberCompany),
    externalRef: S(inst.externalRef),
    templateId: S(inst.templateId),
    contractKind: inst.contractKind || null,
    signer: inst.signer || null,

    // 항목마다 «언제 확인했는지»가 값과 함께 붙어야 증거가 된다.
    sections: pages.map((p) => ({
      key: S(p.key),
      title: S(p.title),
      confirmLabel: S(p.confirmLabel),
      confirmedAt: consents[S(p.key)] || null,
      rows: (p.rows || []).map((r) => ({ label: S(r.label), value: S(r.value), raw: r.raw ?? null })),
    })),

    inputs: inputGroups.flatMap((g) => (g.fields || []).map((f) => ({
      group: S(g.key),
      key: S(f.key),
      label: S(f.label),
      value: S(values[f.key]),
      required: !!f.required,
    }))),

    // 「동의합니다」 한 줄이 아니라 항목·목적·보유기간까지 그대로 남긴다.
    consents: consentAtoms.map((c) => ({
      key: S(c.key),
      label: S(c.label),
      required: !!c.required,
      items: c.items ?? null,
      purpose: S(c.purpose),
      retention: S(c.retention),
      recipients: c.recipients ?? null,
      agreed: acks[c.key] === true,
      answered: acks[c.key] !== undefined,
      answeredAt: consents[`ack:${S(c.key)}`] || null,
    })),

    cautions: (inst.cautions || []).map((c) => ({ text: S(c.text), article: S(c.article) })),
    cautionsAckedAt: consents.cautions || null,

    agreement: {
      version: S(agreement.version),
      title: S(agreement.title),
      isSample: !!agreement.isSample,
      articleCount: (agreement.sections || []).length,
      // 버전만으로는 문구 교체를 못 잡는다. 본문 전체 해시를 따로 박는다.
      bodyHash: createHash("sha256").update(canonical(agreement.sections || []), "utf8").digest("hex"),
      agreedAt: consents.agreement || null,
    },

    documents: requiredDocs.map((d) => {
      const got = (inst.documents || []).find((x) => x.key === d.key);
      return {
        key: S(d.key),
        label: S(d.label),
        required: !!d.required,
        submitted: !!got?.submittedAt,
        storagePath: got?.storagePath || "",
        submittedAt: got?.submittedAt || null,
      };
    }),

    identity: {
      // 착한거래는 «사진을 받아 보관»만 한다. 대조 판정은 담당자가 콘솔에서 한다.
      idCardPath: inst.identity?.idCardPath || "",
      selfiePath: inst.identity?.selfiePath || "",
      method: S(inst.identity?.method),
      submittedAt: inst.identity?.verifiedAt || null,
      staffVerifiedAt: inst.identity?.staffVerifiedAt || null,
      staffVerifiedBy: S(inst.identity?.staffVerifiedBy),
    },

    signature: {
      storagePath: inst.signaturePath || "",
      signedAt: inst.signedAt || now,
      signerUserId: S(inst.signedBy),
      ip: S(inst.signedIp),
    },

    issuedAt: inst.issuedAt || null,
    openedAt: inst.openedAt || null,
    sealedAt: now,
  };

  /* ── 봉인 ──────────────────────────────────── */
  const sealHash = createHash("sha256").update(canonical(atoms), "utf8").digest("hex");

  /* ── ② A4용 — 당사자만 ────────────────────────── */
  const a4 = {
    contractId: inst.contractId,
    title: S(inst.contractKind?.title) || S(agreement.title) || "자동차 대여 계약서",
    member: S(inst.memberCompany),
    externalRef: S(inst.externalRef),
    lessee: atoms.signer,
    // 인쇄 순서 = 손님이 본 순서. 다르면 「본 것과 다른 문서」가 된다.
    blocks: atoms.sections.map((sec) => ({
      heading: sec.title,
      rows: sec.rows.map((r) => [r.label, r.value]),
      confirmedAt: sec.confirmedAt,
    })),
    inputs: atoms.inputs.map((f) => [f.label, f.value]),
    consents: atoms.consents.map((c) => [c.label, c.agreed ? "동의함" : "동의하지 않음"]),
    cautions: atoms.cautions,
    agreementTitle: atoms.agreement.title,
    agreementVersion: atoms.agreement.version,
    signatureAt: atoms.signature.signedAt,
    signaturePath: atoms.signature.storagePath,
    sealHash,
    renderedAt: now,
  };

  /* ── ③ 증명서용 — 제3자 ───────────────────────── */
  const verifyNo = `CHD-${new Date(now).toISOString().slice(0, 10).replace(/-/g, "")}-${sealHash.slice(0, 6).toUpperCase()}`;
  const certificate = {
    verifyNo,
    contractHash: sealHash,
    signerMasked: maskName(atoms.signer?.name),
    signedAt: atoms.signature.signedAt,
    sectionsConfirmed: atoms.sections.filter((x) => x.confirmedAt).length,
    sectionsTotal: atoms.sections.length,
    agreementVersion: atoms.agreement.version,
    documentsSubmitted: atoms.documents.filter((d) => d.submitted).length,
    documentsRequired: atoms.documents.filter((d) => d.required).length,
    identitySubmitted: !!(atoms.identity.idCardPath && atoms.identity.selfiePath),
    // 담당자가 눌러야 true 가 된다. 대조를 안 했는데 「확인 완료」로 기록하지 않는다.
    identityVerifiedByStaff: !!atoms.identity.staffVerifiedAt,
    // 제3자에게 «주지 않는 것»을 문서에 남긴다.
    excluded: ["금액", "계좌", "주소", "연락처", "생년월일", "주민등록번호", "신분증·얼굴 사진", "제출서류 원본", "서명 이미지"],
    issuedAt: now,
  };

  return { atoms, a4, certificate, sealHash, verifyNo };
}
