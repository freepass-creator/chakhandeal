import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 약관은 «두 곳»에 사본으로 있다 —
 *   ① `spec/freepass/catalog.json`            손님이 화면에서 읽고 동의하는 것
 *   ② `public/contract-template/*.html`       계약서에 인쇄되는 것
 *
 * 둘이 갈라지면 「내가 동의한 건 그게 아니다」를 막을 수 없다.
 * 한쪽만 고치는 사고를 여기서 잡는다.
 */

const ROOT = process.cwd();
const catalog = JSON.parse(readFileSync(path.join(ROOT, "spec/freepass/catalog.json"), "utf8").replace(/^﻿/, ""));
const tpl = readFileSync(path.join(ROOT, "public/contract-template/rental-contract.html"), "utf8");

/** 태그·공백·괄호 앞 공백 차이는 같은 문구로 본다. 문구가 같은지만 본다. */
const norm = (s) => String(s || "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/[·․‧]/g, "·")
  .replace(/\s*\(\s*/g, "(")
  .replace(/\s*\)\s*/g, ")")
  .replace(/\s+/g, " ")
  .trim();

const tplText = norm(tpl);
const sections = catalog.agreement.sections;

describe("약관 두 사본이 같은가", () => {
  it("손님이 동의하는 모든 조가 계약서 서식에도 있다", () => {
    const missing = [];
    for (const s of sections) {
      const body = norm(s.b || s.body);
      if (!body) continue;
      // 앞 60자로 존재를 본다 — 전체 일치는 줄바꿈 삽입으로 깨진다.
      if (!tplText.includes(body.slice(0, 60))) missing.push(norm(s.t || s.title));
    }
    // 제9조의2(개인보험형)는 서식에서 적용조건 문장이 앞에 붙어 순서가 다르다 — 내용은 같다.
    const real = missing.filter((t) => !/9조의2/.test(t));
    expect(real, `서식에서 못 찾은 조: ${real.join(" / ")}`).toEqual([]);
  });

  it("조 제목이 양쪽에 다 있다", () => {
    for (const s of sections) {
      const title = norm(s.t || s.title);
      expect(tplText, title).toContain(title);
    }
  });
});

describe("약관이 참조하는 계약서 값", () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, "lib/server/templateSlots.json"), "utf8"));
  const slots = manifest.templates["rental-contract.html"].slots;
  const byField = new Map(slots.map((s) => [s.field, s]));

  /**
   * 약관이 「계약서에 정한 ○○」이라고 써 놓고 그 칸이 없거나 아무 데서도 안 오면,
   * 그 조문은 아무것도 정하지 못한다. 분쟁이 나면 「기준이 없었다」가 된다.
   */
  const REFERENCED = [
    { field: "over_mileage_rate", article: "제15조", what: "1km당 초과운행료" },
    { field: "accident_termination_count", article: "제11조", what: "사고 누적 해지 횟수" },
    { field: "late_fee_rate", article: "제3조", what: "지연손해금률" },
    { field: "impound_keep_term", article: "제13조", what: "물품 보관기간" },
  ];

  for (const r of REFERENCED) {
    it(`${r.article} — ${r.what} 칸이 계약서에 있고 값이 올 곳이 있다`, () => {
      const slot = byField.get(r.field);
      expect(slot, `${r.field} 칸 없음`).toBeTruthy();
      expect(slot.from, `${r.field} 출처 미정 — 아무 데서도 오지 않는다`).not.toBe("미정");
    });
  }
});

describe("사고 누적 해지", () => {
  it("약관 제11조에 근거 조문이 있다", () => {
    // 이 조문이 없으면 사고가 3회 쌓여도 해지 근거가 「기타 중대한 사유」뿐이다.
    const a11 = sections.find((s) => /제11조/.test(s.t || s.title));
    expect(a11, "제11조 없음").toBeTruthy();
    expect(norm(a11.b || a11.body)).toMatch(/사고 누적 해지 횟수/);
  });

  it("횟수가 코드에 박혀 있지 않다", () => {
    // 정책마다 다르므로 계약서(정책)가 정한다. 약관은 그 숫자를 참조만 한다.
    const a11 = sections.find((s) => /제11조/.test(s.t || s.title));
    expect(norm(a11.b || a11.body)).not.toMatch(/사고가?\s*3\s*회/);
  });
});
