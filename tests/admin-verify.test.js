import { beforeEach, describe, expect, it } from "vitest";
import {
  issueContractInstance,
  markIdentityVerifiedByStaff,
  requestSupplement,
  recordIdentityPhotos,
  resetContractInstancesForTest,
} from "../lib/server/contractInstances.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PAYLOAD = {
  memberCompany: "freepass",
  externalRef: "T-ADMIN-1",
  templateId: "rent_buyout",
  signer: { name: "홍길동", birth: "900715", phone: "01000000000" },
  consentGroups: [{ key: "vehicle", title: "차량", rows: [] }],
  requiredDocs: [],
  agreement: { version: "v1", title: "약관", sections: [{ no: 1, title: "목적", body: "…" }] },
};

async function fresh() {
  resetContractInstancesForTest();
  const { instance } = await issueContractInstance(PAYLOAD, {
    memberCompany: "freepass",
    origin: "https://sign.example.com",
  });
  return instance.contractId;
}

describe("담당자 본인확인", () => {
  let id;
  beforeEach(async () => { id = await fresh(); });

  it("촬영본이 없으면 확인할 수 없다", async () => {
    // 사진 없이 「확인했다」가 찍히면 그 기록은 거짓이다.
    await expect(markIdentityVerifiedByStaff(id, { staff: "admin@x" })).rejects.toMatchObject({
      code: "PHOTOS_MISSING",
    });
  });

  it("확인하면 누가·언제가 남는다", async () => {
    await recordIdentityPhotos(id, { idCardDataUrl: PNG, selfieDataUrl: PNG, method: "stub" });
    const inst = await markIdentityVerifiedByStaff(id, { staff: "admin@x", note: "일치" });
    expect(inst.identity.staffVerifiedAt).toBeGreaterThan(0);
    expect(inst.identity.staffVerifiedBy).toBe("admin@x");
    expect(inst.identity.staffNote).toBe("일치");
  });

  it("두 번 눌러도 최초 확인 시각이 유지된다", async () => {
    // 최초로 눈으로 본 시각이 증거다. 나중 클릭으로 덮이면 그 증거가 사라진다.
    await recordIdentityPhotos(id, { idCardDataUrl: PNG, selfieDataUrl: PNG, method: "stub" });
    const a = await markIdentityVerifiedByStaff(id, { staff: "admin@x" });
    const b = await markIdentityVerifiedByStaff(id, { staff: "other@x" });
    expect(b.identity.staffVerifiedAt).toBe(a.identity.staffVerifiedAt);
    expect(b.identity.staffVerifiedBy).toBe("admin@x");
  });
});

describe("보완 요청", () => {
  let id;
  beforeEach(async () => { id = await fresh(); });

  it("항목도 사유도 없으면 거절한다", async () => {
    await expect(requestSupplement(id, { items: [], message: "  " })).rejects.toMatchObject({ status: 400 });
  });

  it("이력으로 쌓인다", async () => {
    // 마지막 것만 남기면 「몇 번 요청했는지」가 사라져 책임을 가릴 수 없다.
    await requestSupplement(id, { items: ["신분증 재촬영"], staff: "a@x" });
    const inst = await requestSupplement(id, { message: "흐립니다", staff: "b@x" });
    expect(inst.supplements).toHaveLength(2);
    expect(inst.supplements[0].items).toEqual(["신분증 재촬영"]);
    expect(inst.supplements[1].message).toBe("흐립니다");
  });
});
