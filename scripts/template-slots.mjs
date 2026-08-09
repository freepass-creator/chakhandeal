/**
 * A4 계약서 서식의 «칸 규격»을 굳힌다.
 *
 * 두 곳을 맞춰 본다.
 *   ① 서식 HTML(`public/contract-template/*.html`) — 실제로 값이 박히는 자리. 이게 정본이다.
 *   ② 회원사 칸 명세(`spec/field-map.json`)   — 각 칸의 이름·출처. 회원사가 준다.
 *
 * 둘이 어긋나면 «서식에는 있는데 아무도 안 채우는 칸»(빈칸으로 인쇄됨)이나
 * «명세에는 있는데 서식에 없는 칸»(보내도 아무 데도 안 들어감)이 생긴다.
 * 법적으로 쓰는 문서에서 빈칸은 그냥 흠이므로, 그 두 가지를 여기서 세어 둔다.
 *
 *   node scripts/template-slots.mjs          규격 갱신
 *   node scripts/template-slots.mjs --check  갱신이 필요한지만 확인(CI용)
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TPL_DIR = path.join(ROOT, "public", "contract-template");
const SPEC_DIR = path.join(ROOT, "spec");
const OUT = path.join(ROOT, "lib", "server", "templateSlots.json");

/** 서식에서 실제 칸 이름만 뽑는다. 템플릿 스크립트가 만드는 동적 이름은 칸이 아니다. */
function slotsOf(html) {
  const out = new Set();
  for (const m of html.matchAll(/data-field="([^"]+)"/g)) {
    if (!/[+'`${}]/.test(m[1])) out.add(m[1]);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** A4 낱장 수. 서식마다 마크업이 조금씩 달라 class 목록으로 센다. */
function sheetsOf(html) {
  return (html.match(/class="[^"]*\bpage\b[^"]*"/g) || []).length;
}

/**
 * 회원사가 준 칸 명세. **서식 하나에 명세 하나**다 —
 * 서식마다 칸이 다르므로 한 명세를 여러 서식에 대면 없는 칸이 잔뜩 잡힌다.
 * 명세가 아직 없는 서식은 「칸은 있는데 채울 사람이 정해지지 않은 상태」로 남는다.
 */
function loadFieldMap(member, file) {
  if (!member) return null;
  const f = path.join(SPEC_DIR, `${member}.${file.replace(/\.html$/, "")}.field-map.json`);
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""));
}

const MEMBER_OF_TEMPLATE = {
  "rental-contract.html": "freepass",
  "contract-individual.html": "freepass",
  "contract-guarantor.html": "freepass",
};

const files = readdirSync(TPL_DIR).filter((f) => f.endsWith(".html")).sort();
const manifest = {
  note: "A4 계약서 서식의 칸 규격. 서식 HTML + 회원사 칸 명세에서 자동 생성한다 — 손으로 고치지 말 것.",
  generatedFrom: ["public/contract-template/*.html", "spec/*.field-map.json"],
  templates: {},
};

for (const file of files) {
  const html = readFileSync(path.join(TPL_DIR, file), "utf8");
  const slots = slotsOf(html);
  const member = MEMBER_OF_TEMPLATE[file] || "";
  const map = loadFieldMap(member, file);
  const byField = new Map((map || []).map((m) => [m.field, m]));

  manifest.templates[file] = {
    member,
    hasFieldMap: !!map,
    sheets: sheetsOf(html),
    slotCount: slots.length,
    // 서식에는 있는데 명세에 없는 칸 — 채울 사람이 정해지지 않았다. 빈칸으로 인쇄된다.
    unspecified: map ? slots.filter((s) => !byField.has(s)) : slots,
    // 명세에는 있는데 서식에 없는 칸 — 보내도 아무 데도 안 들어간다.
    orphanSpec: (map || []).filter((m) => !slots.includes(m.field)).map((m) => m.field),
    slots: slots.map((field) => {
      const m = byField.get(field);
      return m ? { field, label: m.label || "", from: m.from || "", atom: m.atom || "" } : { field };
    }),
  };
}

const next = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== next) {
    console.error("서식이 바뀌었는데 규격이 갱신되지 않았습니다. `node scripts/template-slots.mjs` 를 실행하세요.");
    process.exit(1);
  }
  console.log("규격 최신");
} else {
  writeFileSync(OUT, next, "utf8");
  for (const [file, t] of Object.entries(manifest.templates)) {
    console.log(
      `${file.padEnd(28)} A4 ${String(t.sheets).padStart(2)}장 · 칸 ${String(t.slotCount).padStart(3)}개` +
      ` · 출처미정 ${String(t.unspecified.length).padStart(3)}` +
      ` · 헛도는명세 ${t.orphanSpec.length}`,
    );
  }
  console.log(`→ ${path.relative(ROOT, OUT)}`);
}
