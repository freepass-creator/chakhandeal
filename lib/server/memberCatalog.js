/**
 * 회원사별 «커스터마이징 카탈로그».
 *
 * 착한거래가 프리패스 전자계약을 수주했다. 그러므로 프리패스용 약관·서류·입력항목·동의항목은
 * **착한거래 안에** 있어야 한다 — 회원사가 발행할 때마다 들고 오는 것이 아니다.
 * 회원사는 «계약조건»만 패킹해서 보내고, 나머지는 여기서 붙는다.
 *
 * (앞서는 회원사가 89KB 를 통째로 보냈다. 그 대부분이 계약과 무관한 고정값이었고,
 *  그러면 두 번째 회원사도 똑같이 89KB 를 만들어야 한다. 그건 «플랫폼»이 아니다.)
 *
 * 카탈로그는 회원사 소스에서 뽑아 `spec/{회원사}/catalog.json` 에 둔다 — 손으로 적지 않는다.
 * 손으로 적으면 회원사가 항목을 하나 늘릴 때마다 두 벌이 어긋난다.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const CACHE = new Map();

function specDir() {
  return path.join(process.cwd(), "spec");
}

/** @returns {object|null} 등록되지 않은 회원사는 null — 여기서 남의 카탈로그로 대신하지 않는다. */
export function memberCatalog(memberCompany) {
  const key = String(memberCompany || "").trim();
  if (!key) return null;
  if (CACHE.has(key)) return CACHE.get(key);

  const f = path.join(specDir(), key, "catalog.json");
  let v = null;
  if (existsSync(f)) {
    try {
      v = JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""));
    } catch {
      v = null;
    }
  }
  CACHE.set(key, v);
  return v;
}

export function resetMemberCatalogCacheForTest() {
  CACHE.clear();
}

/**
 * 섹션 배열 → 손님 화면 배열. **1섹션 = 1화면**, 쪼개지 않는다.
 * 값이 하나도 없는 섹션은 화면을 만들지 않는다 — 빈 화면에서 「확인」을 누르게 하면 안 된다.
 *
 * 회원사가 `consentPages` 를 직접 보내면 그걸 쓰고, 계약조건(`consentGroups`)만 보내면
 * 이 규칙으로 착한거래가 끊는다. 규칙이지 값이 아니므로 이쪽에 있는 것이 맞다.
 */
export function paginateForMobile(groups, { readThroughRows = 0 } = {}) {
  const shown = (Array.isArray(groups) ? groups : []).filter((g) => (g?.rows || []).length > 0);
  return shown.map((g, i) => ({
    key: g.key,
    title: g.title,
    step: i + 1,
    totalSteps: shown.length,
    stepLabel: `${i + 1} / ${shown.length}`,
    note: g.note || "",
    rows: g.rows,
    confirmLabel: g.confirmLabel || "",
    // 행이 많은 섹션은 스크롤 끝에 닿기 전까지 확인 버튼을 잠근다.
    requireReadThrough: g.rows.length > (Number(readThroughRows) || 0),
  }));
}

/**
 * 물어볼 입력 항목을 고른다.
 *
 * 항목 «풀» 은 고정이고, 어느 것을 실제로 물을지만 계약 상태로 갈린다.
 * 그래서 회원사는 값 전체가 아니라 «플래그» 만 보내면 된다.
 *
 * @param flags.isBusiness      개인사업자 — 아닌 손님에게 물으면 화면만 길어진다
 * @param flags.hasExtraDriver  추가운전자 지정
 * @param flags.filled          이미 채워진 항목 키 목록 — 다시 묻지 않는다
 */
export function inputsFor(catalog, flags = {}) {
  const pools = catalog?.inputPools || {};
  const filled = new Set(Array.isArray(flags.filled) ? flags.filled : []);
  const pool = [
    ...(pools.customer || []),
    ...(flags.isBusiness ? pools.business || [] : []),
    ...(flags.hasExtraDriver ? pools.driver || [] : []),
    // 출금계좌는 늘 받는다 — 계약은 됐는데 돈 빠질 계좌가 없으면 첫 달부터 연체다.
    ...(pools.bank || []),
  ];
  return pool.filter((f) => f && !f.affectsPrice && !filled.has(f.key));
}

/** 손님 화면을 묶음별로 끊는다 — 종이 신청서 한 장으로 만들지 않는다. */
export function inputGroupsFor(catalog, flags = {}) {
  const fields = inputsFor(catalog, flags);
  const consents = consentAtomsFor(catalog, flags);
  const labels = catalog?.inputPools?.groupLabels || {};
  return ["customer", "business", "driver", "bank"]
    .map((key) => ({
      key,
      title: labels[key] || key,
      fields: fields.filter((f) => f.group === key),
      consents: consents.filter((c) => c.group === key),
    }))
    .filter((g) => g.fields.length > 0 || g.consents.length > 0);
}

/** 아직 안 받은 개인정보 동의만. 이미 받은 것을 또 물으면 손님이 「왜 또」가 된다. */
export function consentAtomsFor(catalog, flags = {}) {
  const done = new Set(Array.isArray(flags.consented) ? flags.consented : []);
  return (catalog?.consentAtoms || []).filter((c) => c && !done.has(c.key));
}

/**
 * 회원사가 «계약조건만» 보냈을 때 나머지를 카탈로그에서 채운다.
 *
 * 회원사가 직접 보낸 것은 절대 덮지 않는다 —
 * 아직 옛 방식으로 보내는 회원사의 화면이 조용히 바뀌면 안 된다(하위호환).
 */
export function applyCatalog(body, memberCompany) {
  const catalog = memberCatalog(memberCompany);
  if (!catalog) return body;

  const has = (k) => {
    const v = body?.[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  };
  const flags = body?.flags && typeof body.flags === "object" ? body.flags : {};
  const out = { ...body };

  if (!has("agreement") && catalog.agreement) out.agreement = catalog.agreement;
  if (!has("keyClauses") && catalog.keyClauses) out.keyClauses = catalog.keyClauses;
  if (!has("requiredDocs") && catalog.requiredDocs) out.requiredDocs = catalog.requiredDocs;
  if (!has("readThroughRows") && catalog.readThroughRows) out.readThroughRows = catalog.readThroughRows;

  if (!has("consentAtoms")) out.consentAtoms = consentAtomsFor(catalog, flags);
  if (!has("inputGroups")) out.inputGroups = inputGroupsFor(catalog, flags);
  if (!has("inputRequests")) out.inputRequests = inputsFor(catalog, flags);

  // 화면 끊기는 «규칙»이다 — 계약조건만 오면 여기서 끊는다.
  if (!has("consentPages") && has("consentGroups")) {
    out.consentPages = paginateForMobile(out.consentGroups, {
      readThroughRows: Number(catalog.readThroughRows) || 0,
    });
  }

  return out;
}
