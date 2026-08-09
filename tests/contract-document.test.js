import { describe, expect, it } from "vitest";
import { issueDocumentTicket, verifyDocumentTicket } from "../lib/server/documentTicket.js";
import { templateFileFor } from "../lib/server/contractDocument.js";

process.env.IDENTITY_SIGNING_SECRET ||= "test-secret-for-document-ticket";

describe("계약서 열람표", () => {
  it("자기 계약에만 통한다", () => {
    const { ticket } = issueDocumentTicket("chd_aaa");
    expect(verifyDocumentTicket(ticket, "chd_aaa")).toBe(true);
    // A 계약의 표로 B 계약서를 열 수 있으면 링크 하나로 남의 계약서가 다 뚫린다.
    expect(verifyDocumentTicket(ticket, "chd_bbb")).toBe(false);
  });

  it("만료되면 안 통한다", () => {
    const now = Date.now();
    const { ticket, expiresAt } = issueDocumentTicket("chd_aaa", { now, ttlMs: 1000 });
    expect(verifyDocumentTicket(ticket, "chd_aaa", { now })).toBe(true);
    expect(verifyDocumentTicket(ticket, "chd_aaa", { now: expiresAt + 1 })).toBe(false);
  });

  it("위조·변조를 걸러낸다", () => {
    const { ticket } = issueDocumentTicket("chd_aaa");
    const [body, mac] = ticket.split(".");
    // 서명은 그대로 두고 몸통만 다른 계약으로 바꿔치기
    const forgedBody = Buffer.from(`chd_bbb.${Date.now() + 60_000}`).toString("base64url");
    expect(verifyDocumentTicket(`${forgedBody}.${mac}`, "chd_bbb")).toBe(false);
    expect(verifyDocumentTicket(`${body}.${mac}x`, "chd_aaa")).toBe(false);
    expect(verifyDocumentTicket("", "chd_aaa")).toBe(false);
    expect(verifyDocumentTicket("garbage", "chd_aaa")).toBe(false);
  });
});

describe("A4 템플릿 선택", () => {
  it("계약 유형에 맞는 서식을 고른다", () => {
    expect(templateFileFor("rent_buyout")).toBe("rental-contract.html");
    expect(templateFileFor("individual")).toBe("contract-individual.html");
    // 모르는 유형이라고 문서를 못 내면 안 되므로 기본 서식으로 떨어진다.
    expect(templateFileFor("")).toBe("rental-contract.html");
  });
});
