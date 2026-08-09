import { beforeEach, describe, expect, it } from "vitest";
import {
  applyCatalog,
  memberCatalog,
  paginateForMobile,
  inputGroupsFor,
  resetMemberCatalogCacheForTest,
} from "../lib/server/memberCatalog.js";
import {
  issueContractInstance,
  resetContractInstancesForTest,
} from "../lib/server/contractInstances.js";

/** 회원사가 «계약조건만» 패킹해서 보내는 모습. 약관·서류·폼을 들고 오지 않는다. */
const CONDITIONS_ONLY = {
  memberCompany: "freepass",
  externalRef: "T-CAT-1",
  templateId: "rent_buyout",
  signer: { name: "홍길동", birth: "900715", phone: "01000000000" },
  consentGroups: [
    { key: "vehicle", title: "차량", note: "", confirmLabel: "확인", rows: [{ label: "차량번호", value: "12가1234" }] },
    { key: "rental", title: "대여 조건", note: "", confirmLabel: "확인", rows: [{ label: "월 대여료", value: "1,000,000원" }] },
    { key: "empty", title: "빈 섹션", note: "", confirmLabel: "확인", rows: [] },
  ],
  data: { contractCode: "T-CAT-1" },
};

beforeEach(() => {
  resetMemberCatalogCacheForTest();
  resetContractInstancesForTest();
});

describe("회원사 카탈로그", () => {
  it("프리패스 카탈로그가 착한거래에 있다", () => {
    const c = memberCatalog("freepass");
    expect(c, "spec/freepass/catalog.json").toBeTruthy();
    expect(c.agreement.sections.length).toBe(22);
    expect(c.agreement.isSample).toBe(false);
    expect(c.requiredDocs.length).toBeGreaterThan(0);
    expect(c.consentAtoms.length).toBeGreaterThan(0);
  });

  it("등록 안 된 회원사에 남의 카탈로그를 대신 쓰지 않는다", () => {
    expect(memberCatalog("someone-else")).toBeNull();
    const body = { memberCompany: "someone-else", consentGroups: [] };
    expect(applyCatalog(body, "someone-else")).toBe(body);
  });

  it("계약조건만 보내도 약관·서류·폼이 붙는다", () => {
    const out = applyCatalog(CONDITIONS_ONLY, "freepass");
    expect(out.agreement.sections.length).toBe(22);
    expect(out.requiredDocs.length).toBeGreaterThan(0);
    expect(out.consentAtoms.length).toBeGreaterThan(0);
    expect(out.inputGroups.length).toBeGreaterThan(0);
    expect(out.consentPages.length).toBe(2);   // 빈 섹션은 화면을 만들지 않는다
  });

  it("회원사가 직접 보낸 것은 덮지 않는다", () => {
    // 옛 방식으로 보내는 회원사의 화면이 조용히 바뀌면 안 된다.
    const mine = { version: "custom-v9", title: "우리 약관", sections: [{ t: "제1조", b: "…" }] };
    const out = applyCatalog({ ...CONDITIONS_ONLY, agreement: mine, requiredDocs: [{ key: "x", label: "X" }] }, "freepass");
    expect(out.agreement).toBe(mine);
    expect(out.requiredDocs).toHaveLength(1);
  });
});

describe("화면 끊기", () => {
  it("1섹션 = 1화면, 빈 섹션은 만들지 않는다", () => {
    const pages = paginateForMobile(CONDITIONS_ONLY.consentGroups, { readThroughRows: 6 });
    expect(pages.map((p) => p.key)).toEqual(["vehicle", "rental"]);
    expect(pages[0].stepLabel).toBe("1 / 2");
    expect(pages[0].requireReadThrough).toBe(false);
  });
});

describe("입력 항목은 플래그로 갈린다", () => {
  it("개인사업자가 아니면 사업자 칸을 묻지 않는다", () => {
    const c = memberCatalog("freepass");
    const plain = inputGroupsFor(c, {});
    const biz = inputGroupsFor(c, { isBusiness: true });
    expect(plain.some((g) => g.key === "business")).toBe(false);
    expect(biz.some((g) => g.key === "business")).toBe(true);
  });

  it("이미 채운 값은 다시 묻지 않는다", () => {
    const c = memberCatalog("freepass");
    const all = inputGroupsFor(c, {}).flatMap((g) => g.fields).map((f) => f.key);
    const some = inputGroupsFor(c, { filled: [all[0]] }).flatMap((g) => g.fields).map((f) => f.key);
    expect(some).not.toContain(all[0]);
    expect(some.length).toBe(all.length - 1);
  });
});

describe("발행", () => {
  it("계약조건만으로 계약이 발행된다", async () => {
    // 이게 되면 회원사는 89KB 가 아니라 계약조건만 보내면 된다.
    const { instance } = await issueContractInstance(CONDITIONS_ONLY, {
      memberCompany: "freepass",
      origin: "https://sign.example.com",
    });
    expect(instance.agreement.sections.length).toBe(22);
    expect(instance.agreement.version).toBeTruthy();
    expect(instance.consentPages.length).toBe(2);
    expect(instance.requiredDocs.length).toBeGreaterThan(0);
  });

  it("서명 뒤 약관을 고쳐도 이미 발행된 계약은 그때 판 그대로다", async () => {
    // 계약에 약관 사본이 통째로 박히므로 카탈로그를 바꿔도 지난 계약은 흔들리지 않는다.
    const { instance } = await issueContractInstance(CONDITIONS_ONLY, {
      memberCompany: "freepass",
      origin: "https://sign.example.com",
    });
    const snapshot = JSON.stringify(instance.agreement);
    resetMemberCatalogCacheForTest();
    expect(JSON.stringify(instance.agreement)).toBe(snapshot);
  });
});
