import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, existsSync } from "fs";
import { join } from "path";
import { POST as issuePOST } from "@/app/api/v1/contract/issue/route";
import { GET as contractGET } from "@/app/api/v1/contract/[contractId]/route";
import { GET as guestGET, POST as guestPOST } from "@/app/api/v1/contract/[contractId]/guest/route";
import { resetContractInstancesForTest, getContractInstance } from "@/lib/server/contractInstances";
import { issueIdentityToken } from "@/lib/server/identityToken";
import { UID_HIT } from "@/lib/ids";

const API_KEY = "test-freepass-api-key";
const OTHER_KEY = "test-other-api-key";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function sampleBody(externalRef = "TMP-TEST-01") {
  return {
    memberCompany: "freepass",
    externalRef,
    templateId: "tpl_freepass_rental_v1",
    signer: { name: "홍길동", phone: "01012345678", birth: "1988-03-12" },
    consentGroups: [
      {
        key: "identity",
        title: "본인정보",
        rows: [
          { label: "성명", value: "홍길동" },
          { label: "월 대여료", value: "690,000원" },
        ],
        confirmLabel: "확인",
        required: true,
      },
      {
        key: "vehicle",
        title: "차량정보",
        rows: [{ label: "차량번호", value: "12가3456" }],
        confirmLabel: "확인",
        required: true,
      },
    ],
    requiredDocs: [
      { key: "bank_book", label: "통장 사본", required: false },
    ],
    agreement: {
      version: "sample-v1",
      title: "자동차 대여 표준약관 (샘플)",
      isSample: true,
      requireReadThrough: true,
      confirmLabel: "약관 동의",
      sections: [
        { t: "제1조 (목적)", b: "이 약관은 …" },
        { t: "제2조", b: "내용" },
      ],
    },
    data: { rentAmount: 690000 },
  };
}

function req(url, { method = "GET", headers = {}, body } = {}) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  process.env.DEMO_MEMBER_API_KEYS = `freepass:${API_KEY},otherco:${OTHER_KEY}`;
  resetContractInstancesForTest();
});

afterEach(() => {
  resetContractInstancesForTest();
  const data = join(process.cwd(), ".data");
  if (existsSync(data)) {
    try { rmSync(data, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe("contract issue — M2M + 멱등", () => {
  it("API Key 없으면 401", async () => {
    const r = await issuePOST(req("http://localhost/api/v1/contract/issue", {
      method: "POST",
      body: sampleBody(),
    }));
    expect(r.status).toBe(401);
  });

  it("잘못된 키면 401", async () => {
    const r = await issuePOST(req("http://localhost/api/v1/contract/issue", {
      method: "POST",
      headers: { Authorization: "ApiKey nope" },
      body: sampleBody(),
    }));
    expect(r.status).toBe(401);
  });

  it("발행 → signUrl · 재발행 멱등 · 영속", async () => {
    const r1 = await issuePOST(req("http://x.test/api/v1/contract/issue", {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${API_KEY}`,
        "Idempotency-Key": "freepass:TMP-TEST-01:issue",
        Host: "x.test",
      },
      body: sampleBody("TMP-TEST-01"),
    }));
    expect(r1.status).toBe(200);
    const j1 = await r1.json();
    expect(j1.contractId).toMatch(/^chd_/);
    // 전자계약 손님 링크는 `/sign` 이다 — `/consent?code=` 는 «플랫폼 동의»의 박제 URL이라 성격이 다르다.
    expect(j1.signUrl).toContain(`/sign?c=${j1.contractId}`);
    expect(j1.verifyUrl).toBe("");
    expect(j1.expiresAt).toBeGreaterThan(Date.now());

    const r2 = await issuePOST(req("http://x.test/api/v1/contract/issue", {
      method: "POST",
      headers: { Authorization: `ApiKey ${API_KEY}` },
      body: sampleBody("TMP-TEST-01"),
    }));
    const j2 = await r2.json();
    expect(j2.contractId).toBe(j1.contractId);

    const disk = await getContractInstance(j1.contractId);
    expect(disk?.externalRef).toBe("TMP-TEST-01");
    expect(disk?.consentGroups?.[0]?.rows?.[1]?.value).toBe("690,000원");
  });

  it("다른 회원사 키로 조회 시 404", async () => {
    const issued = await issuePOST(req("http://localhost/api/v1/contract/issue", {
      method: "POST",
      headers: { Authorization: `ApiKey ${API_KEY}` },
      body: sampleBody("TMP-CROSS"),
    }));
    const { contractId } = await issued.json();

    const r = await contractGET(
      req(`http://localhost/api/v1/contract/${contractId}`, {
        headers: { Authorization: `ApiKey ${OTHER_KEY}` },
      }),
      { params: { contractId } },
    );
    expect(r.status).toBe(404);
  });

  it("자기 키로 조회 시 상태·signUrl·progress (원본 경로 없음)", async () => {
    const issued = await issuePOST(req("http://localhost/api/v1/contract/issue", {
      method: "POST",
      headers: { Authorization: `ApiKey ${API_KEY}`, Host: "localhost:3000" },
      body: sampleBody("TMP-GET"),
    }));
    const { contractId, signUrl } = await issued.json();
    const r = await contractGET(
      req(`http://localhost/api/v1/contract/${contractId}`, {
        headers: { Authorization: `ApiKey ${API_KEY}`, Host: "localhost:3000" },
      }),
      { params: { contractId } },
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.status).toBe("issued");
    expect(j.signUrl).toBe(signUrl);
    expect(j.progressTotal).toBe(8);
    expect(j.progress).toBe(0);
    expect(j.documents[0].submitted).toBe(false);
    expect(j.signaturePath).toBeUndefined();
    expect(j.consentGroups[0].rows[1].value).toBe("690,000원");
  });
});

describe("contract guest — open / sign", () => {
  async function issue() {
    const r = await issuePOST(req("http://localhost/api/v1/contract/issue", {
      method: "POST",
      headers: { Authorization: `ApiKey ${API_KEY}` },
      body: sampleBody(`TMP-G-${Date.now()}`),
    }));
    return (await r.json()).contractId;
  }

  it("게스트 오픈 → opened", async () => {
    const contractId = await issue();
    const r = await guestGET(
      req(`http://localhost/api/v1/contract/${contractId}/guest`),
      { params: { contractId } },
    );
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.blocked).toBe(false);
    expect(j.view.status).toBe("opened");
    expect(j.view.agreement.isSample).toBe(true);
    expect(j.view.consentGroups[0].rows[1].value).toBe("690,000원");
  });

  it("서명 후 PNG 경로 저장 · 재오픈 blocked", async () => {
    const contractId = await issue();
    await guestGET(req(`http://localhost/api/v1/contract/${contractId}/guest`), { params: { contractId } });

    const token = issueIdentityToken({ userId: UID_HIT, name: "홍길동", birth: "900715", method: "demo" });

    await guestPOST(
      req(`http://localhost/api/v1/contract/${contractId}/guest`, {
        method: "POST",
        body: { action: "consent", key: "identity", identityToken: token },
      }),
      { params: { contractId } },
    );
    await guestPOST(
      req(`http://localhost/api/v1/contract/${contractId}/guest`, {
        method: "POST",
        body: { action: "consent", key: "vehicle", identityToken: token },
      }),
      { params: { contractId } },
    );
    await guestPOST(
      req(`http://localhost/api/v1/contract/${contractId}/guest`, {
        method: "POST",
        body: { action: "consent", key: "agreement", identityToken: token },
      }),
      { params: { contractId } },
    );
    const sign = await guestPOST(
      req(`http://localhost/api/v1/contract/${contractId}/guest`, {
        method: "POST",
        body: { action: "sign", signature: TINY_PNG, identityToken: token },
      }),
      { params: { contractId } },
    );
    expect(sign.status).toBe(200);
    const inst = await getContractInstance(contractId);
    expect(inst.status).toBe("signed");
    expect(inst.signaturePath).toMatch(/sig\.png/);
    expect(inst.signaturePath.startsWith("data:")).toBe(false);

    const again = await guestGET(
      req(`http://localhost/api/v1/contract/${contractId}/guest`),
      { params: { contractId } },
    );
    const aj = await again.json();
    expect(aj.blocked).toBe(true);
    expect(aj.reason).toBe("signed");
  });
});
