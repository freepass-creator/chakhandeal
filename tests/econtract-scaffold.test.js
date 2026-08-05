import { describe, it, expect, beforeEach } from "vitest";
import {
  AGREEMENT_KINDS,
  buildConsentLink,
  getVerticalContractTemplate,
  listContractTemplatesFor,
  normalizeAgreementKind,
} from "@/lib/contracts";
import {
  listResolvableContracts,
  resolveContractTemplate,
} from "@/lib/server/contracts";
import { mockResetStore } from "@/lib/server/mockStore";
import { completeConsent } from "@/lib/server/consent";
import { issueIdentityToken, verifyIdentityToken } from "@/lib/server/identityToken";
import { UID_HIT } from "@/lib/ids";
import { GET as contractsGET } from "@/app/api/v1/contracts/route";

beforeEach(() => {
  mockResetStore();
  if (globalThis.__rsProStore) {
    delete globalThis.__rsProStore.customContracts;
  }
});

describe("e-contract scaffold — templates", () => {
  it("기본 모드는 platform_consent", () => {
    expect(normalizeAgreementKind(undefined)).toBe(AGREEMENT_KINDS.PLATFORM_CONSENT);
    expect(normalizeAgreementKind("nope")).toBe(AGREEMENT_KINDS.PLATFORM_CONSENT);
  });

  it("업종별 기본 계약서 id가 다르다", () => {
    const rent = getVerticalContractTemplate("rent");
    const pet = getVerticalContractTemplate("pet");
    expect(rent.id).toContain("rent");
    expect(pet.id).toContain("pet");
    expect(rent.requireReadThrough).toBe(true);
    expect(pet.sections.length).toBeGreaterThan(0);
  });

  it("목록에 업종 기본 + 해당 코드 커스텀이 포함된다", () => {
    const rent = listContractTemplatesFor({ vertical: "rent", code: "1001" });
    expect(rent.some((t) => t.source === "vertical")).toBe(true);
    expect(rent.some((t) => t.id === "tpl_custom_demo_rent_v1")).toBe(true);

    const pet = listContractTemplatesFor({ vertical: "pet", code: "2001" });
    expect(pet.some((t) => t.id === "tpl_custom_demo_pet_v1")).toBe(true);
  });

  it("resolve: 전자계약 + contract id", () => {
    const r = resolveContractTemplate({
      agreementKind: AGREEMENT_KINDS.E_CONTRACT,
      contractId: "tpl_rent_rental_v1",
      vertical: "rent",
    });
    expect(r.kind).toBe(AGREEMENT_KINDS.E_CONTRACT);
    expect(r.template?.title).toMatch(/렌탈/);
  });

  it("resolve: platform_consent → template null", () => {
    const r = resolveContractTemplate({ agreementKind: AGREEMENT_KINDS.PLATFORM_CONSENT });
    expect(r.template).toBeNull();
  });

  it("링크 빌더: 기본은 agreement 쿼리 없음", () => {
    expect(buildConsentLink({ origin: "https://x.test", code: "1001" })).toBe(
      "https://x.test/consent?code=1001"
    );
    expect(
      buildConsentLink({
        origin: "https://x.test",
        code: "1001",
        agreementKind: AGREEMENT_KINDS.E_CONTRACT,
        contractId: "tpl_rent_rental_v1",
      })
    ).toBe("https://x.test/consent?code=1001&agreement=e_contract&contract=tpl_rent_rental_v1");
  });
});

describe("e-contract scaffold — API + consent", () => {
  it("GET /api/v1/contracts 목록", async () => {
    const res = await contractsGET(
      new Request("http://localhost/api/v1/contracts?vertical=rent&code=1001")
    );
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.templates.length).toBeGreaterThanOrEqual(2);
    expect(j.agreementKinds.map((k) => k.id)).toContain(AGREEMENT_KINDS.E_CONTRACT);
  });

  it("GET 단일 해석", async () => {
    const res = await contractsGET(
      new Request(
        "http://localhost/api/v1/contracts?agreement=e_contract&contract=tpl_custom_demo_pet_v1&vertical=pet&code=2001"
      )
    );
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.template.source).toBe("custom");
    expect(j.template.id).toBe("tpl_custom_demo_pet_v1");
  });

  it("completeConsent 전자계약 미동의 → 400", async () => {
    const tok = issueIdentityToken({
      userId: UID_HIT,
      method: "phone",
      name: "테스트",
      birth: "900101",
    });
    const subject = verifyIdentityToken(tok);
    await expect(
      completeConsent(
        {
          name: "테스트",
          company: "테스트렌탈",
          code: "1001",
          vertical: "rent",
          agreementKind: AGREEMENT_KINDS.E_CONTRACT,
          contractId: "tpl_rent_rental_v1",
          signed: true,
          verified: { method: "phone", birth: "900101" },
        },
        "test",
        subject
      )
    ).rejects.toMatchObject({ code: "CONTRACT_READ_REQUIRED" });
  });

  it("completeConsent 전자계약 읽고동의 → 기록", async () => {
    const tok = issueIdentityToken({
      userId: UID_HIT,
      method: "phone",
      name: "테스트",
      birth: "900101",
    });
    const subject = verifyIdentityToken(tok);
    const res = await completeConsent(
      {
        name: "테스트",
        company: "테스트렌탈",
        code: "1001",
        vertical: "rent",
        agreementKind: AGREEMENT_KINDS.E_CONTRACT,
        contractId: "tpl_custom_demo_rent_v1",
        contractReadThrough: true,
        contractAgreed: true,
        signed: true,
        verified: { method: "phone", birth: "900101" },
      },
      "test",
      subject
    );
    expect(res.id).toBeTruthy();
    const stored = globalThis.__rsProStore.consents[0];
    expect(stored.agreementKind).toBe(AGREEMENT_KINDS.E_CONTRACT);
    expect(stored.contract.id).toBe("tpl_custom_demo_rent_v1");
    expect(stored.contract.readThrough).toBe(true);
  });

  it("listResolvableContracts dine/stay 포함", () => {
    expect(listResolvableContracts({ vertical: "dine" })[0].vertical).toBe("dine");
    expect(listResolvableContracts({ vertical: "stay" })[0].vertical).toBe("stay");
  });
});
