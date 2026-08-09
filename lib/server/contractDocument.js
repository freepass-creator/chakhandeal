/**
 * 서명이 끝난 계약을 «A4 계약서»로 다시 그린다.
 *
 * 새로 그리지 않는다. 회원사가 준 A4 템플릿(210×297mm, 약관 포함)에
 * 서명 시점에 굳은 값을 그대로 주입한다.
 *   - 값을 다시 계산하면 그때 값으로 만들어져 「손님이 서명한 그 문서」가 아니게 된다.
 *   - 봉인 해시는 원자(atoms) 기준이므로, 이 문서는 그 원자를 사람이 읽는 형태로 옮긴 것이다.
 *
 * 진짜 PDF 를 서버에서 만들지 않는 이유: 한글 PDF 는 폰트를 통째로 실어야 해서
 * 서버리스에 무겁고, 자간·줄바꿈이 브라우저와 달라진다. 브라우저 인쇄(PDF로 저장)가
 * 같은 A4 규격을 더 정확한 글자로 낸다.
 *
 * ⚠ 이 문서에는 착한거래 BI/CI 를 넣지 않는다. 계약 당사자는 회원사와 손님이다.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { effectiveHandover, isPendingHandover } from "./vehicleHandover";

/** templateId → A4 템플릿 파일. 등록되지 않은 템플릿은 문서를 만들지 않는다. */
const TEMPLATES = {
  rent_buyout: "rental-contract.html",
  rent_return: "rental-contract.html",
  individual: "contract-individual.html",
  guarantor: "contract-guarantor.html",
};

const DEFAULT_TEMPLATE = "rental-contract.html";

export function templateFileFor(templateId) {
  return TEMPLATES[String(templateId || "").trim()] || DEFAULT_TEMPLATE;
}

/**
 * `</script>` 가 값 안에 있으면 주입 스크립트가 그 자리에서 끊긴다.
 * U+2028/2029 는 JSON 에서는 멀쩡하지만 자바스크립트 소스에서는 줄바꿈으로 읽혀 문법이 깨진다.
 */
function safeJson(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const dt = (ms) =>
  ms ? new Date(Number(ms)).toLocaleString("ko-KR", { dateStyle: "long", timeStyle: "short" }) : "";

/**
 * 값이 «안 온» 칸에서 예시값을 지워야 하는 목록.
 *
 * 서식의 기본값은 빈 화면을 보기 좋게 하려고 넣어둔 예시다(`주식회사 손오공렌터카`,
 * `조규진`, `010-0000-0000`, `2026. 00. 00.`). 그대로 인쇄되면 서명된 계약서에
 * 남의 회사·가짜 값이 찍힌다. 빈칸은 흠이지만 가짜 값은 사고다.
 *
 * 다만 「고정·표기」 칸은 값이 아니라 인쇄 문구(문서 제목·라벨)이므로 지우면 안 된다.
 * 어느 쪽인지는 칸 명세(`spec/*.field-map.json`)의 `from` 이 안다.
 */
const KEEP_SOURCES = new Set(["고정", "표기"]);
const blankableCache = new Map();

function blankableFields(templateFile) {
  if (blankableCache.has(templateFile)) return blankableCache.get(templateFile);

  let list = null;   // 명세가 없으면 null — 그때는 템플릿이 «전부 비운다»로 간다
  try {
    const manifest = JSON.parse(
      readFileSyncSafe(path.join(process.cwd(), "lib", "server", "templateSlots.json")) || "{}",
    );
    const t = manifest?.templates?.[templateFile];
    if (t?.hasFieldMap && Array.isArray(t.slots)) {
      list = t.slots.filter((s) => !KEEP_SOURCES.has(s.from)).map((s) => s.field);
    }
  } catch {
    list = null;
  }
  blankableCache.set(templateFile, list);
  return list;
}

function readFileSyncSafe(p) {
  try {
    // eslint-disable-next-line global-require
    return require("node:fs").readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

/**
 * 봉인본에서 템플릿 슬롯 값을 꺼낸다.
 * 회원사가 발행 때 `templateFields` 를 실어 보내면 그것이 정본이다.
 */
function sealedPayload(inst, templateFile) {
  const atoms = inst?.atoms || {};
  const fields = { ...(inst?.templateFields || {}) };

  // 손님이 화면에서 «직접 채운» 값은 발행 시점 값보다 뒤에 온다 —
  // 주소·계좌처럼 계약 중에 받은 것들이 여기 있다.
  for (const [k, v] of Object.entries(atoms.inputs || {})) {
    if (v !== undefined && v !== null && String(v) !== "") fields[k] = v;
  }

  /*
   * 인도 기재가 «가장 뒤»에 온다 — 신차는 계약 시점에 차량번호·차대번호가 없고,
   * 계약기간도 인도일부터 세므로 시작·종료일이 여기서 정해진다.
   * 계약 원자와 봉인 해시는 그대로다. 인쇄할 때만 두 겹을 합쳐 그린다.
   */
  const handover = effectiveHandover(inst);
  for (const [k, v] of Object.entries(handover)) {
    if (v !== undefined && v !== null && String(v) !== "") fields[k] = v;
  }

  /*
   * 아직 인도 전이면 차량번호·차대번호를 «미정(신차)»으로 세운다.
   * 그냥 비우면 「빠뜨린 건지 아직 없는 건지」 알 수 없다 —
   * 계약서에는 «아직 정해지지 않았다»는 사실 자체가 적혀야 한다.
   */
  const state = { ...(inst?.templateState || {}) };
  if (isPendingHandover(inst)) state.car = "신차";

  return {
    fields,
    blankable: blankableFields(templateFile),
    state: Object.keys(state).length ? state : null,
    signature: inst?.signatureImageUrl || "",
    guarantorSignature: "",
  };
}

/** 인쇄 막대 + 봉인 표시. 템플릿 본문은 손대지 않는다. */
function chrome(inst) {
  const cert = inst?.certificate || {};
  const a4 = inst?.a4 || {};
  const signedAt = dt(a4.signatureAt || inst?.signedAt);
  return `
<style>
  .chd-bar{position:sticky;top:0;z-index:9999;display:flex;gap:10px;align-items:center;flex-wrap:wrap;
    padding:10px 14px;background:#16314d;color:#fff;font:600 13px/1.4 -apple-system,"Malgun Gothic",sans-serif}
  .chd-bar button{padding:8px 14px;border:0;border-radius:7px;background:#fff;color:#16314d;
    font:800 13px/1 inherit;cursor:pointer}
  .chd-bar .m{opacity:.82;font-weight:500;font-size:12px}
  body.embed{padding-top:0}
  @media print{.chd-bar{display:none!important}}
</style>
<div class="chd-bar">
  <button type="button" onclick="window.print()">PDF로 저장 · 인쇄</button>
  <span class="m">서명 완료${signedAt ? ` · ${signedAt}` : ""}${cert.verifyNo ? ` · 검증번호 ${cert.verifyNo}` : ""}</span>
  <span class="m">인쇄 창에서 «대상»을 <b>PDF로 저장</b>, 용지를 <b>A4</b>, 여백을 <b>없음</b>으로 두세요.</span>
</div>`;
}

/**
 * A4 계약서 HTML. 템플릿 파일을 읽어 봉인값 주입 스크립트를 `<head>` 끝에 심는다.
 * (`__SEALED__` 는 템플릿 init 보다 «먼저» 있어야 초안 복원을 건너뛴다.)
 */
export async function renderContractDocument(inst, { templateDir = null, includeToolbar = true } = {}) {
  const file = templateFileFor(inst?.templateId);
  const dir = templateDir || path.join(process.cwd(), "public", "contract-template");
  const html = await readFile(path.join(dir, file), "utf8");

  const inject = `<script>window.__SEALED__=${safeJson(sealedPayload(inst, file))};</script>`;
  const head = html.includes("</head>")
    ? html.replace("</head>", `${inject}\n</head>`)
    : `${inject}\n${html}`;

  return head.replace(
    /<body([^>]*)>/i,
    (m, attrs) => `<body${attrs}>${includeToolbar ? chrome(inst) : ""}`,
  );
}
