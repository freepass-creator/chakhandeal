import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockResetStore, mockListAudits, mockListRisksByKey } from "@/lib/server/mockStore";
import { issueDemoToken } from "@/lib/server/session";
import { issueIdentityToken, verifyIdentityToken } from "@/lib/server/identityToken";
import { registerRisk } from "@/lib/server/risks";
import { makeMatchKey } from "@/lib/server/matchKey";
import { CID_TEST_RENT, CID_PET, UID_HIT } from "@/lib/ids";
import { canReadTransaction } from "@/lib/server/authz";

import { POST as checkPOST } from "@/app/api/v1/check/route";
import { POST as consentPOST } from "@/app/api/v1/consent/route";
import { POST as submitPOST } from "@/app/api/v1/cert/submit/route";
import { GET as certGET } from "@/app/api/v1/cert/route";
import { POST as registerPOST } from "@/app/api/v1/register/route";

function req(url, { method = "GET", body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost"), init);
}

function sessionA() {
  return issueDemoToken({
    email: "test@test.com",
    company: "테스트렌탈",
    role: "member",
    code: "1001",
    companyId: CID_TEST_RENT,
    status: "approved",
  });
}

function sessionB() {
  return issueDemoToken({
    email: "pet@test.com",
    company: "해피펫분양",
    role: "member",
    code: "2001",
    companyId: CID_PET,
    status: "approved",
  });
}

function idvHit() {
  return issueIdentityToken({
    userId: UID_HIT,
    name: "홍길동",
    birth: "900715",
    phone: "010-5555-1212",
    method: "test",
  });
}

beforeEach(() => {
  mockResetStore();
  // cert demo seed flag reset
  if (globalThis.__rsProStore) globalThis.__rsProStore._demoCerts = false;
});

describe("§14 ① owner / subject / 타사", () => {
  it("A 등록 → A·본인은 조회, B는 미노출", async () => {
    await registerRisk(
      {
        name: "홍길동",
        birth: "900715",
        type: "unpaid",
        vertical: "rent",
        company: "테스트렌탈",
        evidence: "x",
        ownerCompanyId: CID_TEST_RENT,
        subjectUserId: UID_HIT,
      },
      "test@test.com",
    );

    const key = makeMatchKey("홍길동", "900715");
    const rows = mockListRisksByKey(key);
    expect(rows.length).toBeGreaterThan(0);
    const record = rows[0];

    const actorA = { companyId: CID_TEST_RENT, email: "test@test.com" };
    const actorB = { companyId: CID_PET, email: "pet@test.com" };
    const subject = { subjectToken: verifyIdentityToken(idvHit()) };

    expect(canReadTransaction(actorA, record)).toBe(true);
    expect(canReadTransaction(subject, record)).toBe(true);
    expect(canReadTransaction(actorB, record)).toBe(false);

    const listB = await certGET(req("http://localhost/api/v1/cert", {
      headers: { Authorization: `Bearer ${sessionB()}` },
    }));
    const jb = await listB.json();
    expect(jb.ok).toBe(true);
    // B 콘솔에 A 소유(테스트렌탈) 건이 없어야 함
    const leaked = (jb.certificates || []).filter((c) => c.providerCompany === "테스트렌탈" && c.ownerCompanyId === CID_TEST_RENT);
    expect(leaked.length).toBe(0);
  });
});

describe("§14 ② 오라클 비노출", () => {
  it("토큰 없이 name+birth 조회 시도 → 401, exists 오라클 없음", async () => {
    const res = await checkPOST(req("http://localhost/api/v1/check", {
      method: "POST",
      body: { name: "홍길동", birth: "900715", phone: "010-5555-1212" },
    }));
    const j = await res.json();
    expect(res.status).toBe(401);
    expect(j.ok).toBe(false);
    expect(j.exists).toBeUndefined();
    expect(j.records).toBeUndefined();
  });

  it("타인 토큰으로도 자기 matchKey만 — 임의 조회 형태 없음", async () => {
    const tok = idvHit();
    const res = await checkPOST(req("http://localhost/api/v1/check", {
      method: "POST",
      body: { identityToken: tok, name: "최민재", birth: "920909" },
    }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    // name+birth는 무시되고 토큰(홍길동) matchKey만 사용 — 시드에 홍길동 hit 있음
    expect(j.exists).toBe(true);
  });
});

describe("§14 ④ 무인증 거부 + access_deny", () => {
  it("/consent · /cert/submit · /check 무토큰 → 401 + 감사", async () => {
    const a = await consentPOST(req("http://localhost/api/v1/consent", {
      method: "POST",
      body: { name: "홍길동", company: "테스트렌탈", verified: { birth: "900715" } },
    }));
    expect(a.status).toBe(401);

    const b = await submitPOST(req("http://localhost/api/v1/cert/submit", {
      method: "POST",
      body: { name: "홍길동", birth: "900715", providerCode: "1001" },
    }));
    expect(b.status).toBe(401);

    const c = await checkPOST(req("http://localhost/api/v1/check", {
      method: "POST",
      body: {},
    }));
    expect(c.status).toBe(401);

    const audits = mockListAudits(50);
    const denies = audits.filter((x) => x.action === "access_deny");
    expect(denies.length).toBeGreaterThanOrEqual(3);
  });
});

describe("§14 ⑤ 주입 스푸핑 무효", () => {
  it("body companyId/subjectUserId 주입해도 세션·토큰이 우선", async () => {
    const tok = idvHit();
    const verified = verifyIdentityToken(tok);

    // register: body.companyId/subjectUserId 무시
    const reg = await registerPOST(req("http://localhost/api/v1/register", {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionA()}` },
      body: {
        name: "스푸핑대상",
        birth: "010101",
        type: "unpaid",
        evidence: "e",
        companyId: CID_PET,
        subjectUserId: "injected-uid",
        ownerCompanyId: CID_PET,
      },
    }));
    const rj = await reg.json();
    expect(rj.ok).toBe(true);

    const key = makeMatchKey("스푸핑대상", "010101");
    const rows = mockListRisksByKey(key);
    expect(rows[0].ownerCompanyId).toBe(CID_TEST_RENT);
    expect(rows[0].subjectUserId).toBe("");

    // submit: body.subjectUserId 무시 → 토큰 userId
    const sub = await submitPOST(req("http://localhost/api/v1/cert/submit", {
      method: "POST",
      body: {
        identityToken: tok,
        name: "홍길동",
        birth: "900715",
        providerCode: "1001",
        subjectUserId: "injected-uid",
        userId: "injected-uid",
        signed: true,
      },
    }));
    const sj = await sub.json();
    expect(sj.ok).toBe(true);
    expect(sj.cert.subjectUserId).toBe(verified.userId);
    expect(sj.cert.subjectUserId).not.toBe("injected-uid");
  });
});
