// 계약 인스턴스 — 템플릿과 분리. Firestore 또는 .data 영속 저장(globalThis 금지).
import { randomBytes } from "crypto";
import { getAdmin } from "./admin";
import { durableRead, durableWrite } from "./durableStore";
import { buildContractRecord } from "./contractSeal";
import { computePurgeAt, isPurgeDue, toPurgedRecord } from "./retention";
import { memberProfile } from "./members";
import { applyCatalog } from "./memberCatalog";
import { buildHandoverRecord } from "./vehicleHandover";
import { saveDataUrl } from "./blobStore";

const COL = "contract_instances";
const FILE = "contract_instances";
const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function mintContractId() {
  // ≥128bit 랜덤, URL-safe
  return `chd_${randomBytes(16).toString("base64url")}`;
}

function fileLoad() {
  return durableRead(FILE, () => ({ byId: {}, byRef: {} }));
}

function fileSave(store) {
  durableWrite(FILE, store);
}

function refKey(memberCompany, externalRef) {
  return `${String(memberCompany)}::${String(externalRef)}`;
}

function normalizeIssueBody(rawBody, memberCompany) {
  /*
   * 회원사가 «계약조건만» 보내면 나머지(약관·서류·입력항목·동의항목·화면끊기)를
   * 착한거래가 가진 그 회원사 카탈로그에서 채운다.
   * 회원사가 직접 보낸 값은 덮지 않는다 — 옛 방식으로 보내는 쪽 화면이 조용히 바뀌면 안 된다.
   */
  const body = applyCatalog(rawBody, String(rawBody?.memberCompany || memberCompany || "").trim());

  const externalRef = String(body?.externalRef || "").trim();
  if (!externalRef) {
    throw Object.assign(new Error("externalRef가 필요합니다."), { status: 400, code: "EXTERNAL_REF_REQUIRED" });
  }
  const consentGroups = Array.isArray(body?.consentGroups) ? body.consentGroups : [];
  if (!consentGroups.length) {
    throw Object.assign(new Error("consentGroups가 필요합니다."), { status: 400, code: "CONSENT_GROUPS_REQUIRED" });
  }
  const agreement = body?.agreement && typeof body.agreement === "object" ? body.agreement : null;
  if (!agreement?.sections?.length) {
    throw Object.assign(new Error("agreement.sections가 필요합니다."), { status: 400, code: "AGREEMENT_REQUIRED" });
  }
  const signer = body?.signer && typeof body.signer === "object" ? body.signer : {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    memberCompany: String(body?.memberCompany || memberCompany || "").trim() || memberCompany,
    externalRef,
    templateId: String(body?.templateId || "").trim(),
    signer: {
      name: String(signer.name || "").trim(),
      phone: String(signer.phone || "").trim(),
      birth: String(signer.birth || "").trim(),
    },
    consentGroups,
    /**
     * 회원사가 «화면을 어떻게 끊을지»까지 정해 보낸다 — 우리가 임의로 나누면
     * 「사고·면책」 같은 섹션이 두 동강 나 앞장만 읽고 넘어간다(프리패스 주석).
     * 아래 것들을 버리면 손님 화면을 계약서대로 그릴 수 없다.
     */
    consentPages: arr(body?.consentPages),
    readThroughRows: arr(body?.readThroughRows),
    // 손님에게 «받아올» 값. 폼을 우리 쪽에 복제하지 않는다.
    inputRequests: arr(body?.inputRequests),
    inputGroups: arr(body?.inputGroups),
    // 개인정보 동의 — 항목·목적·보유기간·받는자까지. 「동의합니다」 한 줄로는 유효하지 않다.
    consentAtoms: arr(body?.consentAtoms),
    // 계약서 말미 주의사항(약관에서 추린 서술형 + 조항번호).
    cautions: arr(body?.cautions),
    // 계약 유형 — 문서명·당사자 호칭·만기 처리가 여기서 갈린다.
    contractKind: body?.contractKind && typeof body.contractKind === "object" ? body.contractKind : null,
    requiredDocs: arr(body?.requiredDocs),
    agreement: {
      version: String(agreement.version || ""),
      title: String(agreement.title || ""),
      isSample: !!agreement.isSample,
      requireReadThrough: agreement.requireReadThrough !== false,
      confirmLabel: String(agreement.confirmLabel || "위 약관을 모두 읽고 이해했으며 이에 동의합니다"),
      sections: agreement.sections,
    },
    data: body?.data && typeof body.data === "object" ? body.data : {},
    /**
     * A4 계약서 인쇄본의 «칸 값». 회원사 템플릿의 data-field 이름 그대로 온다.
     *
     * 화면용(consentPages)과 인쇄용(templateFields)을 굳이 나눠 받는 이유:
     * 화면은 손님이 읽기 좋게 끊은 것이고, 인쇄본은 계약서 서식의 정해진 칸이다.
     * 화면 값에서 인쇄본을 «되짚어» 만들면 칸이 어긋나고 빈칸이 생긴다 —
     * 법적으로 쓰는 문서에서 빈칸은 그냥 흠이다.
     */
    templateFields:
      body?.templateFields && typeof body.templateFields === "object" ? body.templateFields : {},
    // 템플릿 안의 분기 선택(포함/미포함, 개인/법인 등). 없으면 템플릿 기본값.
    templateState:
      body?.templateState && typeof body.templateState === "object" ? body.templateState : null,
  };
}

/**
 * 회원사(프리패스) 패널용 상태.
 * - 패널③: signUrl 복사 · 계약서 미리보기 메타
 * - 패널④: consents 키 = 프리패스 ESIGN_STEPS 와 동일
 *   identity_verified · identity · vehicle · rental · insurance · documents · agreement · signed
 * 서명/신분증/서류 원본 바이너리는 넣지 않는다(제출 여부·시각만).
 */
export function toMemberStatus(inst, { origin = "" } = {}) {
  if (!inst) return null;
  const consents = buildProgressConsents(inst);
  const docs = (inst.requiredDocs || []).map((d) => {
    const hit = (inst.documents || []).find((x) => x.key === d.key);
    return {
      key: d.key,
      label: d.label || d.key,
      required: !!d.required,
      submitted: !!(hit && hit.submittedAt),
      submittedAt: hit?.submittedAt || null,
    };
  });
  const steps = [
    "identity_verified",
    "identity",
    "vehicle",
    "rental",
    "insurance",
    "documents",
    "agreement",
    "signed",
  ];
  let progress = 0;
  for (const k of steps) {
    if (!consents[k]) break;
    progress += 1;
  }

  return {
    contractId: inst.contractId,
    externalRef: inst.externalRef,
    status: inst.status,
    signUrl: buildSignUrl(origin, inst.contractId, inst.memberCompany),
    templateId: inst.templateId || "",
    agreement: inst.agreement
      ? {
          title: inst.agreement.title || "",
          version: inst.agreement.version || "",
          isSample: !!inst.agreement.isSample,
        }
      : null,
    signer: inst.signer || {},
    consentGroups: inst.consentGroups || [],
    consents,
    documents: docs,
    progress,
    progressTotal: steps.length,
    identity: {
      verified: !!(inst.identity?.verifiedAt || consents.identity_verified),
      verifiedAt: inst.identity?.verifiedAt || consents.identity_verified || null,
      hasIdCard: !!inst.identity?.idCardPath,
      hasSelfie: !!inst.identity?.selfiePath,
    },
    hasSignature: !!inst.signaturePath,
    signedAt: inst.signedAt || null,
    openedAt: inst.openedAt || null,
    issuedAt: inst.issuedAt || null,
    expiresAt: inst.expiresAt || null,
    verifyUrl: inst.verifyUrl || "",
    sealHash: inst.sealHash || "",
    verifyNo: inst.verifyNo || "",
  };
}

/** 프리패스 ESIGN_STEPS 키로 정규화한 통과 시각 맵 */
function buildProgressConsents(inst) {
  const raw = { ...(inst.consents || {}) };
  const out = { ...raw };

  if (inst.identity?.verifiedAt && !out.identity_verified) {
    out.identity_verified = inst.identity.verifiedAt;
  }

  const required = (inst.requiredDocs || []).filter((d) => d.required);
  const submitted = inst.documents || [];
  if (required.length > 0) {
    const all = required.every((d) => submitted.some((x) => x.key === d.key && x.submittedAt));
    if (all && !out.documents) {
      const times = required
        .map((d) => submitted.find((x) => x.key === d.key)?.submittedAt)
        .filter(Boolean);
      out.documents = Math.max(...times);
    }
  } else if (!out.documents && (out.agreement || inst.status === "signed")) {
    // 필수 서류 없으면 서류 단계로 스킵 가능 — 약관 이후면 documents 통과로 본다
    out.documents = out.agreement || inst.signedAt || Date.now();
  }

  if (inst.status === "signed" && inst.signedAt) {
    out.signed = inst.signedAt;
  }

  return out;
}

/** 손님 화면용 — rows.value 재포맷 없이 그대로 */
export function toGuestView(inst) {
  if (!inst) return null;
  return {
    contractId: inst.contractId,
    status: inst.status,
    memberCompany: inst.memberCompany,
    // 손님 화면 앞에 서는 이름은 «회원사» 것이다. 착한거래는 뒤에 남는다.
    member: memberProfile(inst.memberCompany),
    signer: inst.signer || {},
    consentGroups: inst.consentGroups || [],
    // 손님이 이미 채운 값·동의 — 링크를 다시 열었을 때 이어서 하도록.
    inputs: inst.inputs || {},
    acks: inst.acks || {},
    // 회원사가 정해 보낸 화면 분할·입력 요청·동의 원자·주의사항을 그대로 넘긴다.
    consentPages: inst.consentPages || [],
    inputGroups: inst.inputGroups || [],
    consentAtoms: inst.consentAtoms || [],
    cautions: inst.cautions || [],
    contractKind: inst.contractKind || null,
    requiredDocs: inst.requiredDocs || [],
    agreement: inst.agreement || null,
    consents: inst.consents || {},
    documents: (inst.documents || []).map((d) => ({
      key: d.key,
      submittedAt: d.submittedAt || null,
    })),
    expiresAt: inst.expiresAt || null,
    signedAt: inst.signedAt || null,
    isExpired: isExpired(inst),
    isSigned: inst.status === "signed",
  };
}

export function isExpired(inst) {
  if (!inst?.expiresAt) return false;
  return Date.now() > Number(inst.expiresAt);
}

export async function getContractInstance(contractId) {
  const id = String(contractId || "").trim();
  if (!id) return null;
  const { ready, db } = getAdmin();
  if (ready) {
    const snap = await db.collection(COL).doc(id).get();
    return snap.exists ? { contractId: id, ...snap.data() } : null;
  }
  const store = fileLoad();
  return store.byId[id] || null;
}

/**
 * 발급된 계약 전체 — 관리자 목록용.
 * 공급사가 아직 직접 못 쓰므로 관리자가 대신 확인한다. 회원사 스코프는 호출부에서 건다.
 */
export async function listContractInstances({ memberCompany = "" } = {}) {
  const { ready, db } = getAdmin();
  let all = [];
  if (ready) {
    const snap = await db.collection(COL).get();
    all = snap.docs.map((d) => ({ contractId: d.id, ...d.data() }));
  } else {
    const store = fileLoad();
    all = Object.values(store.byId || {});
  }
  const mc = String(memberCompany || "").trim();
  return mc ? all.filter((x) => x.memberCompany === mc) : all;
}

export async function findByExternalRef(memberCompany, externalRef) {
  const rk = refKey(memberCompany, externalRef);
  const { ready, db } = getAdmin();
  if (ready) {
    const snap = await db.collection(COL)
      .where("memberCompany", "==", memberCompany)
      .where("externalRef", "==", externalRef)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { contractId: d.id, ...d.data() };
  }
  const store = fileLoad();
  const id = store.byRef[rk];
  return id ? store.byId[id] || null : null;
}

async function writeInstance(inst) {
  const { ready, db } = getAdmin();
  if (ready) {
    const { contractId, ...rest } = inst;
    await db.collection(COL).doc(contractId).set(rest, { merge: true });
    return inst;
  }
  const store = fileLoad();
  store.byId[inst.contractId] = inst;
  store.byRef[refKey(inst.memberCompany, inst.externalRef)] = inst.contractId;
  fileSave(store);
  return inst;
}

/**
 * 발행(멱등: memberCompany+externalRef).
 * @returns {{ instance, created: boolean }}
 */
export async function issueContractInstance(body, { memberCompany, origin = "" } = {}) {
  const norm = normalizeIssueBody(body, memberCompany);
  if (norm.memberCompany !== memberCompany) {
    // 키로 해석된 회원사와 body.memberCompany 불일치 거부
    throw Object.assign(new Error("memberCompany가 API Key와 일치하지 않습니다."), {
      status: 403,
      code: "MEMBER_MISMATCH",
    });
  }

  const existing = await findByExternalRef(memberCompany, norm.externalRef);
  if (existing) {
    return { instance: existing, created: false };
  }

  const now = Date.now();
  const contractId = mintContractId();
  const base = (origin || "").replace(/\/$/, "");
  const inst = {
    contractId,
    memberCompany: norm.memberCompany,
    externalRef: norm.externalRef,
    templateId: norm.templateId,
    status: "issued",
    signer: norm.signer,
    consentGroups: norm.consentGroups,
    consentPages: norm.consentPages,
    readThroughRows: norm.readThroughRows,
    inputRequests: norm.inputRequests,
    inputGroups: norm.inputGroups,
    consentAtoms: norm.consentAtoms,
    cautions: norm.cautions,
    contractKind: norm.contractKind,
    requiredDocs: norm.requiredDocs,
    agreement: norm.agreement,
    data: norm.data,
    // A4 인쇄본 전용 — 손님 화면(toGuestView)으로는 나가지 않는다.
    templateFields: norm.templateFields,
    templateState: norm.templateState,
    consents: {},
    documents: [],
    identity: {},
    signaturePath: "",
    signedAt: null,
    verifyUrl: "",
    sealHash: "",
    issuedAt: now,
    expiresAt: now + DEFAULT_TTL_MS,
    openedAt: null,
  };
  await writeInstance(inst);
  // signUrl은 응답에서만 조합 — 저장 필드로 고정하지 않음(호스트 변경 대비)
  return { instance: inst, created: true, signUrl: buildSignUrl(base, contractId, inst.memberCompany) };
}

/**
 * 손님 서명 링크. `/consent` 가 아니라 `/sign` 이다 —
 * `/consent?code=` 는 «플랫폼 동의»의 박제 URL이고 전자계약은 성격이 다르다.
 * 손님이 받는 링크가 「동의하래」가 아니라 「계약 서명하래」임이 주소에서 드러나야 한다.
 * (`/consent?code=` 는 그대로 둔다 — 깨면 안 되는 URL이다.)
 */
/**
 * 회원사별 손님 링크 도메인. `{"freepass":"https://sign.freepasserp.com"}` 형태.
 *
 * 왜 회원사별인가 — 손님은 «자기가 거래하는 회사»와 계약 중이다.
 * 처음 보는 도메인으로 신분증을 올리라는 링크가 오면 피싱으로 읽힌다.
 * 착한거래는 뒤에 있는 인프라이므로 앞에 서는 이름은 회원사 것이어야 한다.
 */
function memberBaseUrl(memberCompany) {
  try {
    const map = JSON.parse(process.env.MEMBER_BASE_URLS || "{}");
    const v = map?.[String(memberCompany || "").trim()];
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return "";
  }
}

export function buildSignUrl(origin, contractId, memberCompany = "") {
  /*
   * 손님에게 나가는 주소는 «공개 도메인»이어야 한다.
   * 요청 Host 를 그대로 쓰면, 회원사가 내부 주소나 배포 미리보기 URL 로 API 를 부를 때
   * 그 주소가 손님 카톡으로 나간다.
   * 우선순위: 회원사 전용 도메인 → 공용 공개 도메인 → 요청 Host(개발용)
   */
  const base = (memberBaseUrl(memberCompany)
    || String(process.env.PUBLIC_BASE_URL || "").trim()
    || String(origin || "")).replace(/\/$/, "");
  /*
   * 카톡·문자 한 줄에 들어가야 해서 경로를 최대한 줄인다.
   *   /sign?c=chd_fpvaVLXkNOdrcmnuDCRu3w  →  /fpvaVLXkNOdrcmnuDCRu3w
   * 도메인이 이미 `sign.` 이라 경로에 `sign` 을 또 붙이지 않고, `chd_` 접두사도 뺀다.
   * **여기서 더 줄이지 않는다** — 이 문자열이 계약을 지키는 자물쇠다.
   * 계약번호처럼 추측 가능한 값으로 바꾸면 남의 계약 내용이 열린다.
   */
  const short = String(contractId || "").replace(/^chd_/, "");
  return `${base}/${encodeURIComponent(short)}`;
}

export async function markOpened(contractId) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  if (inst.status === "issued") {
    inst.status = "opened";
    inst.openedAt = Date.now();
    await writeInstance(inst);
  }
  return inst;
}

/**
 * 손님이 채운 값 — 비상연락처·거주형태·출금계좌 등.
 * 없으면 계약서 「01 계약자 정보」·「06 결제 방법」이 빈 채로 봉인된다.
 */
export async function recordInputs(contractId, values) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  assertWritable(inst);
  const src = values && typeof values === "object" ? values : {};
  // 계약서가 요구한 필드만 받는다 — 손님 브라우저가 임의 키를 밀어 넣지 못하게.
  const allowed = new Set((inst.inputGroups || []).flatMap((g) => (g.fields || []).map((f) => String(f.key))));
  const next = { ...(inst.inputs || {}) };
  for (const [k, v] of Object.entries(src)) {
    if (allowed.has(String(k))) next[String(k)] = String(v ?? "").slice(0, 200);
  }
  inst.inputs = next;
  await writeInstance(inst);
  return inst;
}

/** 개인정보 동의 응답. 「동의함/동의하지 않음」과 그 시각을 남긴다. */
export async function recordAck(contractId, key, agreed) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  assertWritable(inst);
  const k = String(key || "").trim();
  if (!k) throw Object.assign(new Error("ack key 필요"), { status: 400 });
  const known = (inst.consentAtoms || []).some((c) => String(c.key) === k);
  if (!known) throw Object.assign(new Error("알 수 없는 동의 항목"), { status: 400 });
  inst.acks = { ...(inst.acks || {}), [k]: agreed === true };
  inst.consents = { ...(inst.consents || {}), [`ack:${k}`]: Date.now() };
  await writeInstance(inst);
  return inst;
}

/**
 * 이 계약의 손님에게 불변 ID를 붙인다(본인확인 최초 발급 시 1회).
 * 재진입해도 같은 값을 써야 서명·감사 기록이 한 사람으로 이어진다.
 */
export async function attachSubject(contractId, { subjectUserId, matchKey }) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  if (inst.subjectUserId) return inst; // 이미 붙었으면 바꾸지 않는다
  inst.subjectUserId = String(subjectUserId || "");
  inst.matchKey = String(matchKey || inst.matchKey || "");
  await writeInstance(inst);
  return inst;
}

/**
 * 담당자가 «눈으로» 신분증과 얼굴을 대조하고 통과시킨다.
 *
 * 사진을 받아 두는 것만으로는 본인확인이 아니다. 아무도 안 보면
 * 나중에 다투었을 때 「받기만 했고 확인은 안 했다」가 된다.
 * 그래서 «누가·언제» 봤는지를 계약에 박는다 — 이게 확인의 증거다.
 *
 * 서명이 끝난 계약에도 찍을 수 있어야 한다(보통 서명 뒤에 확인한다).
 * 그래서 `assertWritable` 을 쓰지 않는다 — 대신 계약 내용은 건드리지 않는다.
 */
export async function markIdentityVerifiedByStaff(contractId, { staff, note = "" }) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  const identity = { ...(inst.identity || {}) };
  if (!identity.idCardPath || !identity.selfiePath) {
    throw Object.assign(new Error("신분증·얼굴 촬영본이 없습니다."), { status: 409, code: "PHOTOS_MISSING" });
  }
  if (identity.staffVerifiedAt) return inst;   // 두 번 찍지 않는다 — 최초 확인 시각이 증거다
  identity.staffVerifiedAt = Date.now();
  identity.staffVerifiedBy = String(staff || "");
  if (note) identity.staffNote = String(note).slice(0, 500);
  inst.identity = identity;
  await writeInstance(inst);
  return inst;
}

/**
 * 차량 인도 기재 — 신차라 계약 시점에 없던 차량번호·차대번호·인도일을 뒤늦게 채운다.
 *
 * 서명된 계약에도 붙일 수 있어야 한다. 오히려 «서명 뒤에» 하는 것이 정상이다.
 * 그래서 `assertWritable` 을 쓰지 않는다 — 대신 계약 원자와 봉인 해시는 절대 건드리지 않고,
 * 별도 이력으로만 쌓는다. 손님이 서명한 계약은 그 상태 그대로 남는다.
 */
export async function recordHandover(contractId, { values, staff = "" }) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;

  // 대여기간(개월)은 계약에 이미 있다 — 인도일이 서면 시작·종료일이 여기서 정해진다.
  const months = Number(
    inst.templateFields?.rent_month_value
    || String(inst.templateFields?.rent_month || "").replace(/[^\d]/g, "")
    || 0,
  );

  const record = buildHandoverRecord(values, { staff, rentMonths: months });
  inst.handovers = [...(inst.handovers || []), record];
  await writeInstance(inst);
  return inst;
}

/**
 * 보완 요청 — 신분증이 흐리거나 서류가 빠졌을 때.
 * 손님에게 무엇을 다시 받아야 하는지 남긴다. 이력으로 쌓는다(마지막 것만 남기면
 * 「몇 번을 요청했는지」가 사라져 손님 탓·우리 탓을 가릴 수 없다).
 */
export async function requestSupplement(contractId, { items = [], message = "", staff = "" }) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  const list = Array.isArray(items) ? items.map((s) => String(s).slice(0, 60)).filter(Boolean) : [];
  if (!list.length && !String(message).trim()) {
    throw Object.assign(new Error("보완할 항목이나 사유가 필요합니다."), { status: 400 });
  }
  inst.supplements = [
    ...(inst.supplements || []),
    { items: list, message: String(message).slice(0, 1000), staff: String(staff || ""), requestedAt: Date.now() },
  ];
  await writeInstance(inst);
  return inst;
}

export async function recordConsentStep(contractId, key) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  assertWritable(inst);
  const k = String(key || "").trim();
  if (!k) throw Object.assign(new Error("consent key 필요"), { status: 400 });
  inst.consents = { ...(inst.consents || {}), [k]: Date.now() };
  await writeInstance(inst);
  return inst;
}

export async function recordDocument(contractId, { key, dataUrl }) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  assertWritable(inst);
  const k = String(key || "").trim();
  if (!k) throw Object.assign(new Error("document key 필요"), { status: 400 });
  const path = await saveDataUrl(`contracts/${contractId}/docs/${k}`, dataUrl);
  const documents = [...(inst.documents || []).filter((d) => d.key !== k)];
  documents.push({ key: k, storagePath: path, submittedAt: Date.now() });
  inst.documents = documents;
  // 필수 서류 전부 제출되면 documents 단계 통과
  const required = (inst.requiredDocs || []).filter((d) => d.required);
  if (required.length && required.every((d) => documents.some((x) => x.key === d.key && x.submittedAt))) {
    inst.consents = { ...(inst.consents || {}), documents: Date.now() };
  }
  await writeInstance(inst);
  return inst;
}

export async function recordIdentityPhotos(contractId, { idCardDataUrl, selfieDataUrl, method }) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  assertWritable(inst);
  const identity = { ...(inst.identity || {}), method: method || "stub", verifiedAt: Date.now() };
  if (idCardDataUrl) {
    identity.idCardPath = await saveDataUrl(`contracts/${contractId}/id.jpg`, idCardDataUrl);
  }
  if (selfieDataUrl) {
    identity.selfiePath = await saveDataUrl(`contracts/${contractId}/selfie.jpg`, selfieDataUrl);
  }
  inst.identity = identity;
  // 프리패스 진행단계 키
  inst.consents = { ...(inst.consents || {}), identity_verified: identity.verifiedAt };
  await writeInstance(inst);
  return inst;
}

export async function completeContractSign(contractId, { signatureDataUrl, subjectUserId = "", matchKey = "", ip = "" }) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  assertWritable(inst);

  if (!signatureDataUrl || !String(signatureDataUrl).startsWith("data:")) {
    throw Object.assign(new Error("서명 이미지가 필요합니다."), { status: 400, code: "SIGNATURE_REQUIRED" });
  }

  // required docs
  const required = (inst.requiredDocs || []).filter((d) => d.required);
  for (const d of required) {
    if (!(inst.documents || []).some((x) => x.key === d.key && x.submittedAt)) {
      throw Object.assign(new Error(`필수 서류 미제출: ${d.label || d.key}`), {
        status: 400,
        code: "DOC_REQUIRED",
      });
    }
  }
  // consent groups
  for (const g of inst.consentGroups || []) {
    if (g.required === false) continue;
    if (!inst.consents?.[g.key]) {
      throw Object.assign(new Error(`미확인 항목: ${g.title || g.key}`), {
        status: 400,
        code: "CONSENT_REQUIRED",
      });
    }
  }
  if (!inst.consents?.agreement) {
    throw Object.assign(new Error("약관 동의가 필요합니다."), { status: 400, code: "AGREEMENT_REQUIRED" });
  }

  const signaturePath = await saveDataUrl(`contracts/${contractId}/sig.png`, signatureDataUrl);
  const now = Date.now();
  inst.signaturePath = signaturePath;
  inst.signedAt = now;
  inst.status = "signed";
  inst.consents = { ...(inst.consents || {}), signed: now };
  inst.subjectUserId = subjectUserId || inst.subjectUserId || "";
  inst.matchKey = matchKey || inst.matchKey || "";
  inst.signedBy = subjectUserId || "";
  inst.signedIp = String(ip || "");

  /**
   * 서명 순간에 계약서를 «세 형태»로 굳힌다 — 원자(정본) · A4(당사자) · 증명서(제3자).
   * 나중에 다시 만들면 그때의 값으로 만들어진다. 봉인은 서명 시점의 상태여야 한다.
   */
  const sealed = buildContractRecord(inst, { now });
  inst.atoms = sealed.atoms;
  inst.a4 = sealed.a4;
  inst.certificate = sealed.certificate;
  inst.sealHash = sealed.sealHash;
  inst.verifyNo = sealed.verifyNo;

  // 보관기간(계약 종료 후 5년, 부가가치세법 §32② 증빙)을 서명 시점에 박는다.
  // 넣을 때 정해두지 않으면 나중에 「언제 지워야 하나」를 알 수 없다.
  inst.purgeAt = computePurgeAt(inst, { now });

  await writeInstance(inst);
  return inst;
}

/**
 * 보관기간이 지난 계약의 개인정보를 파기한다(개인정보보호법 §21).
 * 이미지·PII·입력값을 지우고 «계약이 있었다」는 사실만 남긴다.
 */
export async function purgeContract(contractId, { now = Date.now() } = {}) {
  const inst = await getContractInstance(contractId);
  if (!inst) return null;
  if (inst.purgedAt) return inst;

  // ① Storage 증적 삭제 — 신분증·얼굴·서명·제출서류
  const { ready, bucket, db } = getAdmin();
  if (ready && bucket) {
    try {
      await bucket.deleteFiles({ prefix: `contracts/${contractId}/` });
    } catch (e) {
      console.warn("[chakhandeal] 파기 중 Storage 삭제 실패", contractId, e?.message || e);
    }
  }

  // ② 문서를 «존재 사실»만 남기고 통째로 교체 — 필드 삭제가 아니라 치환이라 잔재가 없다.
  const purged = toPurgedRecord(inst, { now });
  if (ready) {
    await db.collection(COL).doc(contractId).set(purged);
  } else {
    const store = fileLoad();
    store.byId[contractId] = purged;
    fileSave(store);
  }
  return purged;
}

/** 파기 대상 목록 — 배치가 부른다. */
export async function listPurgeDue({ now = Date.now(), limit = 200 } = {}) {
  const all = await listContractInstances();
  return all.filter((x) => isPurgeDue(x, { now })).slice(0, limit);
}

function assertWritable(inst) {
  if (!inst) {
    throw Object.assign(new Error("계약을 찾을 수 없습니다."), { status: 404, code: "NOT_FOUND" });
  }
  if (inst.status === "signed") {
    throw Object.assign(new Error("이미 서명된 계약입니다."), { status: 409, code: "ALREADY_SIGNED" });
  }
  if (isExpired(inst)) {
    throw Object.assign(new Error("만료된 계약 링크입니다."), { status: 410, code: "EXPIRED" });
  }
}

/** 테스트용 — 파일 스토어 비우기 */
export function resetContractInstancesForTest() {
  durableWrite(FILE, { byId: {}, byRef: {} });
}
