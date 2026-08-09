/**
 * 차량 인도 기재 — 계약 «뒤에» 확정되는 값을 계약에 붙인다.
 *
 * ★왜 필요한가
 *   신차는 계약 시점에 **차량번호도 차대번호도 없다.** 출고·등록이 끝나야 정해진다.
 *   계약기간도 「차량 인도일로부터 48개월」이라 인도일이 있어야 시작·종료일이 선다.
 *   그래서 계약은 그 칸들을 비운 채 맺고, 인도 시점에 채운다 — 실물 계약서도 같은 방식이다
 *   (서식 02항 「신차(출고 전)는 차량번호·차대번호가 미정이며 … 차량 인수증에 기재합니다」).
 *
 * ★봉인을 건드리지 않는다
 *   서명된 계약의 원자(`atoms`)와 `sealHash` 는 **그대로 둔다.** 손님이 서명한 것은 그 상태이기 때문이다.
 *   인도 기재는 «나중에 덧붙인 사실»이므로 별도 레코드로 쌓고 자체 해시를 갖는다.
 *   계약서를 인쇄할 때만 두 겹을 합쳐 그린다 — 계약 원본은 영원히 서명 당시 그대로다.
 *
 * ★고쳐 쓰지 않고 «다시 기재»한다
 *   잘못 적었으면 새 기재를 쌓고 앞의 것은 남긴다. 지우면 「원래 뭐라고 적혀 있었나」가 사라진다.
 */

import { createHash } from "node:crypto";
import { canonical } from "./contractSeal";

/** 인도 시점에 확정되는 칸. 서식의 `data-field` 이름과 같아야 그대로 박힌다. */
export const HANDOVER_FIELDS = [
  { key: "car_number", label: "차량번호", required: true },
  { key: "vin", label: "차대번호", required: true },
  { key: "handover_datetime", label: "인도 일시", required: true },
  { key: "handover_location", label: "인도 장소", required: false },
  { key: "handover_agent_name", label: "인도 담당자", required: false },
  { key: "odometer_delivery", label: "인도 시 주행거리", required: false },
  { key: "fuel_gauge_delivery", label: "인도 시 연료량", required: false },
  { key: "damage_delivery", label: "인도 시 손상", required: false },
];

const KEYS = new Set(HANDOVER_FIELDS.map((f) => f.key));

/** 계약기간은 «인도일»부터 센다. 인도일이 서면 계약 시작·종료가 비로소 정해진다. */
export function deriveTerm(handoverDate, months) {
  const m = Number(months) || 0;
  const d = new Date(String(handoverDate || "").slice(0, 10));
  if (!m || Number.isNaN(d.getTime())) return null;
  const end = new Date(d);
  end.setMonth(end.getMonth() + m);
  end.setDate(end.getDate() - 1);
  const iso = (x) => x.toISOString().slice(0, 10);
  return { contract_start: iso(d), contract_end: iso(end) };
}

/**
 * 인도 기재 하나를 만든다. 저장은 호출부가 한다.
 * @param values 서식 칸 이름 → 값. 모르는 키는 버린다(계약 값을 아무거나 덮어쓰지 못하게).
 */
export function buildHandoverRecord(values, { staff = "", now = Date.now(), rentMonths = 0 } = {}) {
  const fields = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (!KEYS.has(k)) continue;
    const s = String(v ?? "").trim();
    if (s) fields[k] = s;
  }

  const missing = HANDOVER_FIELDS.filter((f) => f.required && !fields[f.key]).map((f) => f.label);
  if (missing.length) {
    throw Object.assign(new Error(`${missing.join(" · ")}이(가) 필요합니다.`), {
      status: 400,
      code: "HANDOVER_FIELDS_REQUIRED",
    });
  }

  // 인도일이 정해졌으니 계약기간을 여기서 확정한다 — 계약서 03항이 이 값을 기다린다.
  const term = deriveTerm(fields.handover_datetime, rentMonths);
  if (term) Object.assign(fields, term);

  const record = { fields, staff: String(staff || ""), recordedAt: now };
  record.hash = createHash("sha256").update(canonical(record), "utf8").digest("hex");
  return record;
}

/**
 * 계약서를 그릴 때 쓸 «최종» 인도값. 마지막 기재가 이긴다.
 * 앞의 기재는 지우지 않고 남으므로 이력은 그대로다.
 */
export function effectiveHandover(inst) {
  const list = Array.isArray(inst?.handovers) ? inst.handovers : [];
  if (!list.length) return {};
  return list[list.length - 1]?.fields || {};
}

/** 아직 인도 기재가 없는 계약은 차량번호·차대번호가 «미정»이다. */
export function isPendingHandover(inst) {
  return !effectiveHandover(inst).car_number;
}
