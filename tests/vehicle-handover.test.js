import { beforeEach, describe, expect, it } from "vitest";
import {
  buildHandoverRecord,
  deriveTerm,
  effectiveHandover,
  isPendingHandover,
} from "../lib/server/vehicleHandover.js";
import {
  issueContractInstance,
  recordHandover,
  getContractInstance,
  completeContractSign,
  recordIdentityPhotos,
  recordConsentStep,
  recordDocument,
  resetContractInstancesForTest,
} from "../lib/server/contractInstances.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** 신차 계약 — 차량번호도 차대번호도 없이 맺는다. */
const NEW_CAR = {
  memberCompany: "freepass",
  externalRef: "T-HO-1",
  templateId: "rent_buyout",
  signer: { name: "홍길동", birth: "900715", phone: "01000000000" },
  consentGroups: [{ key: "vehicle", title: "차량", rows: [{ label: "차명", value: "제네시스 G80" }] }],
  templateFields: { vehicle_name: "제네시스 G80", rent_month: "48 개월" },
  data: {},
};

async function issue() {
  resetContractInstancesForTest();
  const { instance } = await issueContractInstance(NEW_CAR, {
    memberCompany: "freepass",
    origin: "https://sign.example.com",
  });
  return instance.contractId;
}

describe("신차 — 번호 없이 계약", () => {
  let id;
  beforeEach(async () => { id = await issue(); });

  it("차량번호·차대번호 없이도 계약이 발행된다", async () => {
    const inst = await getContractInstance(id);
    expect(inst.templateFields.car_number).toBeUndefined();
    expect(inst.templateFields.vin).toBeUndefined();
    // 계약서에는 «미정(신차)»으로 인쇄되어야 한다 — 빈칸이면 빠뜨린 건지 알 수 없다.
    expect(isPendingHandover(inst)).toBe(true);
  });

  it("인도 기재로 차량번호·차대번호·인도일이 채워진다", async () => {
    const inst = await recordHandover(id, {
      values: { car_number: "12가1234", vin: "KMHXX00XXXX000000", handover_datetime: "2026-09-01" },
      staff: "admin@x",
    });
    expect(isPendingHandover(inst)).toBe(false);
    expect(effectiveHandover(inst).car_number).toBe("12가1234");
  });

  it("계약기간은 인도일부터 센다", () => {
    // 계약서 「차량 인도일로부터 48개월」 — 인도일이 서야 시작·종료가 정해진다.
    expect(deriveTerm("2026-09-01", 48)).toEqual({ contract_start: "2026-09-01", contract_end: "2030-08-31" });
    expect(deriveTerm("", 48)).toBeNull();
  });

  it("필수 칸이 없으면 기재를 거절한다", () => {
    expect(() => buildHandoverRecord({ car_number: "12가1234" })).toThrow(/차대번호|인도 일시/);
  });

  it("모르는 키는 버린다", () => {
    // 인도 기재로 대여료·보증금 같은 계약 값을 덮어쓸 수 있으면 안 된다.
    const r = buildHandoverRecord(
      { car_number: "12가1234", vin: "V1", handover_datetime: "2026-09-01", rent_amount: "1" },
      { rentMonths: 0 },
    );
    expect(r.fields.rent_amount).toBeUndefined();
  });
});

describe("봉인 불변", () => {
  it("서명된 계약에 인도를 기재해도 원자·봉인해시가 그대로다", async () => {
    const id = await issue();
    await recordIdentityPhotos(id, { idCardDataUrl: PNG, selfieDataUrl: PNG, method: "stub" });
    await recordConsentStep(id, "agreement");
    // 카탈로그가 붙여 준 섹션 확인·필수 서류를 채워야 서명까지 간다.
    const inst0 = await getContractInstance(id);
    for (const p of inst0.consentPages || []) await recordConsentStep(id, p.key);
    for (const d of (inst0.requiredDocs || []).filter((x) => x.required)) {
      await recordDocument(id, { key: d.key, dataUrl: PNG });
    }
    const signed = await completeContractSign(id, { signatureDataUrl: PNG, subjectUserId: "u1", matchKey: "m1" });
    const sealBefore = signed.sealHash;
    const atomsBefore = JSON.stringify(signed.atoms);

    const after = await recordHandover(id, {
      values: { car_number: "12가1234", vin: "V1", handover_datetime: "2026-09-01" },
      staff: "admin@x",
    });

    // 손님이 서명한 것은 그 상태다. 나중에 덧붙인 사실이 그것을 바꾸면 안 된다.
    expect(after.sealHash).toBe(sealBefore);
    expect(JSON.stringify(after.atoms)).toBe(atomsBefore);
    expect(after.handovers).toHaveLength(1);
  });

  it("다시 기재하면 앞의 것이 남고 마지막이 이긴다", async () => {
    const id = await issue();
    await recordHandover(id, { values: { car_number: "11가1111", vin: "V1", handover_datetime: "2026-09-01" }, staff: "a" });
    const inst = await recordHandover(id, { values: { car_number: "22나2222", vin: "V2", handover_datetime: "2026-09-02" }, staff: "b" });
    // 지우면 「원래 뭐라고 적혀 있었나」가 사라진다.
    expect(inst.handovers).toHaveLength(2);
    expect(inst.handovers[0].fields.car_number).toBe("11가1111");
    expect(effectiveHandover(inst).car_number).toBe("22나2222");
  });
});

