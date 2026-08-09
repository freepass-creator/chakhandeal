import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { templateFileFor } from "../lib/server/contractDocument.js";

const ROOT = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(ROOT, "lib/server/templateSlots.json"), "utf8"));
const tplPath = (f) => path.join(ROOT, "public/contract-template", f);

describe("A4 서식 규격", () => {
  it("등록된 계약 유형은 모두 실제 서식을 가리킨다", () => {
    for (const id of ["rent_buyout", "rent_return", "individual", "guarantor", ""]) {
      const file = templateFileFor(id);
      expect(manifest.templates[file], `${id} → ${file}`).toBeTruthy();
    }
  });

  it("서식은 A4 규격이다", () => {
    for (const [file, t] of Object.entries(manifest.templates)) {
      const html = readFileSync(tplPath(file), "utf8");
      expect(html, `${file}: @page A4`).toMatch(/@page\s*\{[^}]*size:\s*A4/i);
      expect(html, `${file}: 210mm 폭`).toContain("210mm");
      expect(t.sheets, `${file}: A4 낱장`).toBeGreaterThan(0);
    }
  });

  it("명세가 붙은 서식은 헛도는 칸이 없다", () => {
    // 명세에는 있는데 서식에 없는 칸 = 회원사가 보내도 아무 데도 안 들어간다.
    for (const [file, t] of Object.entries(manifest.templates)) {
      if (!t.hasFieldMap) continue;
      expect(t.orphanSpec, `${file}`).toEqual([]);
    }
  });

  it("봉인본은 손님 기기에 계약 값을 남기지 않는다", () => {
    /*
     * 원본 서식은 새로고침 대비로 localStorage 에 초안을 저장·복원한다.
     * 봉인본에서 그대로 두면 ① 다른 계약의 값이 서명된 문서에 섞이고
     * ② 손님 폰에 이름·계좌가 평문으로 남는다. 두 함수 다 SEALED 에서 즉시 빠져야 한다.
     */
    for (const file of Object.keys(manifest.templates)) {
      const html = readFileSync(tplPath(file), "utf8");
      if (!html.includes("localStorage")) continue;
      expect(html, `${file}: SEALED 분기`).toMatch(/var SEALED\s*=\s*!!window\.__SEALED__/);
      expect(html, `${file}: 초안 저장 차단`).toMatch(/function saveDraft\(\)\s*\{\s*if\(SEALED\)\s*return;/);
      expect(html, `${file}: 초안 복원 차단`).toMatch(/function loadDraft\(\)\s*\{\s*if\(SEALED\)\s*return;/);
    }
  });

  it("계약서에 착한거래 BI/CI 가 없다", () => {
    // 손님은 회원사와 계약한다. 낯선 회사 이름이 계약서에 있으면 안 된다.
    for (const file of Object.keys(manifest.templates)) {
      expect(readFileSync(tplPath(file), "utf8"), file).not.toMatch(/착한거래|chakhandeal/i);
    }
  });
});
