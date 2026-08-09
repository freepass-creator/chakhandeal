import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { getAdmin } from "@/lib/server/admin";
import { durableRead, durableWrite } from "@/lib/server/durableStore";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 서명 완료 → 계약서를 «세 형태»로 저장한다.
 *
 *   ① atoms       원자용 — 정본. 섹션·항목·값·확인시각·동의·서명 경로. 봉인 대상.
 *   ② a4          A4용   — 사람이 읽는 계약서(인쇄·PDF). 당사자(본인 + 발행 회원사)만.
 *   ③ certificate 증명서용 — 제3자(`/v?id=`)에게 나가는 사실 요약. 금액·PII 없음.
 *
 * 정본은 ①이다. ②·③은 ①에서 파생되지만 **함께 저장**한다.
 * ②는 「그때 손님이 본 문서」의 증거이고, ③은 제3자 열람 때 원자를 열지 않기 위해서다.
 * 무엇을 뺐는지가 ③에 명시적으로 남는 것도 중요하다.
 *
 * 운영 경로가 아니다(테스트). DEMO_MODE 에서만 열린다.
 */
const LABS_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
const COLLECTION = "lab_contracts";
const FILE = "lab_contracts";

const S = (v) => String(v ?? "").trim();

/** 봉인 대상을 문자열로 정규화한다 — 키 순서·공백에 따라 해시가 흔들리면 안 된다. */
function canonical(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${k}:${canonical(value[k])}`).join(",")}}`;
  }
  return String(value);
}

export async function POST(req) {
  if (!LABS_ENABLED) {
    return NextResponse.json({ ok: false, error: "labs 비활성" }, { status: 404 });
  }

  const ip = clientIp(req);
  const rl = rateLimit(`labs-submit:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const payload = body?.payload || {};
  const checks = body?.checks || {};   // 섹션키 → 확인 시각(ms)
  const inputs = body?.inputs || {};
  const acks = body?.acks || {};
  const files = body?.files || {};
  const sessionId = S(body?.sessionId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);

  const pages = Array.isArray(payload.consentPages) ? payload.consentPages : [];
  const inputGroups = Array.isArray(payload.inputGroups) ? payload.inputGroups : [];
  const consentAtoms = Array.isArray(payload.consentAtoms) ? payload.consentAtoms : [];
  const requiredDocs = Array.isArray(payload.requiredDocs) ? payload.requiredDocs : [];
  const agreement = payload.agreement || {};

  if (!pages.length) {
    return NextResponse.json({ ok: false, error: "계약 내용이 비어 있습니다." }, { status: 400 });
  }
  if (!files.signature) {
    return NextResponse.json({ ok: false, error: "서명이 없습니다." }, { status: 400 });
  }

  const now = Date.now();
  const contractId = `chd_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

  /* ── ① 원자용 — 정본 ─────────────────────────────── */
  const atoms = {
    contractId,
    memberCompany: S(payload.memberCompany),
    externalRef: S(payload.externalRef),
    templateId: S(payload.templateId),
    contractKind: payload.contractKind || null,
    signer: payload.signer || null,

    // 항목 하나하나가 원자다. «언제 확인했는지»가 값과 함께 붙어야 증거가 된다.
    sections: pages.map((p) => ({
      key: S(p.key),
      title: S(p.title),
      confirmLabel: S(p.confirmLabel),
      confirmedAt: checks[p.key] || null,
      rows: (p.rows || []).map((r) => ({
        label: S(r.label),
        value: S(r.value),
        raw: r.raw ?? null,
      })),
    })),

    // 손님이 채운 값
    inputs: inputGroups.flatMap((g) => (g.fields || []).map((f) => ({
      group: S(g.key),
      key: S(f.key),
      label: S(f.label),
      value: S(inputs[f.key]),
      required: !!f.required,
    }))),

    // 개인정보 동의 — 「동의합니다」 한 줄이 아니라 항목·목적·보유기간까지 그대로 남긴다.
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
    })),

    agreement: {
      version: S(agreement.version),
      title: S(agreement.title),
      isSample: !!agreement.isSample,
      articleCount: (agreement.sections || []).length,
      // 약관 본문은 버전으로 특정한다. 본문 전체 해시를 따로 박아 문구 교체를 잡는다.
      bodyHash: createHash("sha256").update(canonical(agreement.sections || []), "utf8").digest("hex"),
    },

    documents: requiredDocs.map((d) => {
      const got = files[d.key];
      return {
        key: S(d.key),
        label: S(d.label),
        required: !!d.required,
        submitted: !!got,
        storagePath: got?.storagePath || "",
        sha256: got?.sha256 || "",
        submittedAt: got?.receivedAt || null,
      };
    }),

    identity: {
      // 착한거래는 «사진을 받아 보관»만 한다. 대조 판정은 담당자가 콘솔에서 한다.
      idCardPath: files.idcard?.storagePath || "",
      idCardSha256: files.idcard?.sha256 || "",
      selfiePath: files.selfie?.storagePath || "",
      selfieSha256: files.selfie?.sha256 || "",
      submittedAt: files.selfie?.receivedAt || files.idcard?.receivedAt || null,
      verifiedByStaff: false,   // 사람이 확인해야 true 가 된다
      verifiedAt: null,
      verifiedBy: "",
    },

    signature: {
      storagePath: files.signature?.storagePath || "",
      sha256: files.signature?.sha256 || "",
      signedAt: files.signature?.receivedAt || now,
    },

    sessionId,
    submittedAt: now,
  };

  /* ── 봉인 — 원자를 정규화해 해시한다 ─────────────── */
  const sealHash = createHash("sha256").update(canonical(atoms), "utf8").digest("hex");

  /* ── ② A4용 — 사람이 읽는 계약서. 당사자만 ────────── */
  const a4 = {
    contractId,
    title: S(payload.contractKind?.title) || "자동차 대여 계약서",
    lessee: atoms.signer,
    member: S(payload.memberCompany),
    externalRef: S(payload.externalRef),
    // 인쇄 순서 = 손님이 본 순서. 다르면 「본 것과 다른 문서」가 된다.
    blocks: atoms.sections.map((sec) => ({
      heading: sec.title,
      rows: sec.rows.map((r) => [r.label, r.value]),
      confirmedAt: sec.confirmedAt,
    })),
    inputs: atoms.inputs.map((f) => [f.label, f.value]),
    consents: atoms.consents.map((c) => [c.label, c.agreed ? "동의함" : "동의하지 않음"]),
    agreementTitle: atoms.agreement.title,
    agreementVersion: atoms.agreement.version,
    signatureAt: atoms.signature.signedAt,
    signaturePath: atoms.signature.storagePath,
    sealHash,
    renderedAt: now,
  };

  /* ── ③ 증명서용 — 제3자에게 나가는 사실 요약 ──────── */
  const verifyNo = `CHD-${new Date(now).toISOString().slice(0, 10).replace(/-/g, "")}-${sealHash.slice(0, 6).toUpperCase()}`;
  const certificate = {
    verifyNo,
    contractHash: sealHash,
    // 이름은 가운데를 가린다. 제3자에게 실명 원문을 그대로 주지 않는다.
    signerMasked: (() => {
      const n = S(atoms.signer?.name);
      if (n.length <= 1) return n;
      if (n.length === 2) return `${n[0]}*`;
      return `${n[0]}${"*".repeat(n.length - 2)}${n[n.length - 1]}`;
    })(),
    signedAt: atoms.signature.signedAt,
    sectionsConfirmed: atoms.sections.filter((x) => x.confirmedAt).length,
    sectionsTotal: atoms.sections.length,
    agreementVersion: atoms.agreement.version,
    documentsSubmitted: atoms.documents.filter((d) => d.submitted).length,
    documentsRequired: atoms.documents.filter((d) => d.required).length,
    identitySubmitted: !!(atoms.identity.idCardPath && atoms.identity.selfiePath),
    identityVerifiedByStaff: false,
    // 제3자에게 «주지 않는 것»을 문서에 남긴다. 나중에 슬그머니 늘어나는 걸 막는다.
    excluded: ["금액", "계좌", "주소", "연락처", "생년월일", "신분증·얼굴 사진", "제출서류 원본", "서명 이미지"],
    issuedAt: now,
  };

  const record = { contractId, sealHash, atoms, a4, certificate };

  /* ── 저장 ────────────────────────────────────────── */
  let store = "file";
  let path = `.data/${FILE}.json`;
  try {
    const { ready, db } = getAdmin();
    if (ready && db) {
      await db.collection(COLLECTION).doc(contractId).set(record);
      store = "firestore";
      path = `${COLLECTION}/${contractId}`;
    } else {
      const all = durableRead(FILE, {});
      all[contractId] = record;
      durableWrite(FILE, all);
    }
  } catch (e) {
    console.error("[labs/submit] 저장 실패", e);
    return NextResponse.json({ ok: false, error: e?.message || "저장 실패" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved: {
      contractId,
      sealHash,
      store,
      path,
      certificate: { verifyNo },
      counts: {
        atoms: atoms.sections.reduce((n, x) => n + x.rows.length, 0) + atoms.inputs.length,
        confirmed: atoms.sections.filter((x) => x.confirmedAt).length,
        a4Sections: a4.blocks.length,
        articles: atoms.agreement.articleCount,
      },
    },
  });
}
