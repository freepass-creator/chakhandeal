import { describe, it, expect, beforeEach } from "vitest";
import { mockResetStore, mockListRisksByKey } from "@/lib/server/mockStore";
import { registerRisk } from "@/lib/server/risks";
import { submitCertificate, buildCertificateDraft, getCertificate } from "@/lib/server/certificate";
import { encryptField, decryptField, __resetCryptoForTests, resolveKek } from "@/lib/server/crypto";
import { mintCompanyUserToken } from "@/lib/server/companyKeys";
import { readPiiVault } from "@/lib/server/piiVault";
import { makeMatchKey } from "@/lib/server/matchKey";
import { CID_TEST_RENT, CID_PET, UID_HIT } from "@/lib/ids";
import { issueIdentityToken } from "@/lib/server/identityToken";
import { completeConsent } from "@/lib/server/consent";
import { verifyIdentityToken } from "@/lib/server/identityToken";

beforeEach(() => {
  mockResetStore();
  if (globalThis.__rsProStore) globalThis.__rsProStore._demoCerts = false;
});

describe("Phase 3 crypto envelope", () => {
  it("encrypt → decrypt roundtrip", () => {
    const enc = encryptField("홍길동");
    expect(enc.ct).toBeTruthy();
    expect(enc.wrappedDek).toBeTruthy();
    expect(decryptField(enc)).toBe("홍길동");
  });

  it("운영(!DEMO)+KEK 미설정 → fail-closed", () => {
    __resetCryptoForTests();
    const prevDemo = process.env.NEXT_PUBLIC_DEMO_MODE;
    const prevKek = process.env.PII_KEK;
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    delete process.env.PII_KEK;
    delete process.env.NEXT_PHASE;
    expect(() => resolveKek()).toThrow(/PII_KEK/);
    process.env.NEXT_PUBLIC_DEMO_MODE = prevDemo;
    process.env.PII_KEK = prevKek;
    __resetCryptoForTests();
    resolveKek(); // restore
  });
});

describe("Phase 3 pseudonymized storage", () => {
  it("registerRisk 레코드에 평문 name/birth/phone 부재", async () => {
    await registerRisk({
      name: "홍길동",
      birth: "900715",
      type: "unpaid",
      phone: "010-5555-1212",
      license: "x",
      reason: "미납",
      evidence: "e",
      company: "테스트렌탈",
      ownerCompanyId: CID_TEST_RENT,
      subjectUserId: UID_HIT,
    }, "test@test.com");

    const key = makeMatchKey("홍길동", "900715");
    const rows = mockListRisksByKey(key).filter((r) => r.company === "테스트렌탈" && r.evidence === "e");
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0];
    expect(r.name).toBeUndefined();
    expect(r.birth).toBeUndefined();
    expect(r.phone).toBeUndefined();
    expect(r.license).toBeUndefined();
    expect(r.reason).toBeUndefined();
    expect(r.piiRef).toBeTruthy();
    expect(r.phone_lookup_token).toBeTruthy();
    expect(r.company_user_token).toBeTruthy();

    const pii = await readPiiVault(r.piiRef);
    expect(pii.name).toBe("홍길동");
    expect(pii.birth).toBe("900715");
  });

  it("submitCertificate 가명화 + /v 마스킹만", async () => {
    const draft = await buildCertificateDraft({
      matchKey: makeMatchKey("홍길동", "900715"),
      vertical: "rent",
      method: "test",
    });
    const { id, cert } = await submitCertificate({
      draft,
      provider: { code: "1001", company: "테스트렌탈", companyId: CID_TEST_RENT },
      subject: {
        name: "홍길동",
        birth: "900715",
        phone: "010-5555-1212",
        userId: UID_HIT,
        matchKey: makeMatchKey("홍길동", "900715"),
        method: "test",
      },
      signed: true,
    });
    expect(cert.subjectName).toBeUndefined();
    expect(cert.subjectBirth).toBeUndefined();
    expect(cert.subjectPhone).toBeUndefined();
    expect(cert.subjectNameMasked).toMatch(/^홍/);
    expect(cert.piiRef).toBeTruthy();

    const got = await getCertificate(id);
    expect(got.subjectName).toBeUndefined();
    expect(got.subjectNameMasked).toBeTruthy();
  });

  it("completeConsent 토큰-only + vault", async () => {
    const tok = issueIdentityToken({
      userId: UID_HIT,
      name: "홍길동",
      birth: "900715",
      method: "test",
    });
    const subject = verifyIdentityToken(tok);
    const res = await completeConsent({
      name: "홍길동",
      birth: "900715",
      phone: "010-5555-1212",
      company: "테스트렌탈",
      code: "1001",
      vertical: "rent",
      signed: true,
      verified: { birth: "900715", method: "test" },
    }, "test", subject);
    expect(res.id).toBeTruthy();
    const stored = globalThis.__rsProStore.consents[0];
    expect(stored.name).toBeUndefined();
    expect(stored.phone).toBeUndefined();
    expect(stored.piiRef).toBeTruthy();
    expect(stored.company_user_token).toBeTruthy();
  });
});

describe("Phase 3 company_user_token I3", () => {
  it("동일 subjectUserId에 대해 A·B 회사 토큰이 상이", async () => {
    const a = await mintCompanyUserToken(CID_TEST_RENT, UID_HIT);
    const b = await mintCompanyUserToken(CID_PET, UID_HIT);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
