// 위험 매칭 / 등록 — Admin 또는 mock. 클라이언트는 이 레이어를 직접 import 하지 않음(API 경유).
import { getAdmin } from "./admin";
import { makeMatchKey } from "./matchKey";
import { cleanBirth } from "@/lib/format";
import { mockListRisksByKey, mockAddRisk, mockListAllRisks, mockResolveAppeal } from "./mockStore";
import { writeAudit } from "./audit";
import { phoneLookupToken } from "./crypto";
import { upsertPiiVault } from "./piiVault";
import { mintCompanyUserToken } from "./companyKeys";

function minimizeRecord(r) {
  return {
    id: r.id,
    type: r.type,
    vertical: r.vertical || "rent",
    company: r.company || "",
    status: r.status || "active",
  };
}

/** 업종 스코프 — rent(기본 업종)는 전체, 그 외 업종은 자기 업종 레코드만. 증명서·동의 공용 규칙 */
export function filterRecordsByVertical(records, vertical) {
  return (records || []).filter((r) => !r.vertical || r.vertical === vertical || vertical === "rent");
}

function summarizeRows(rows, key) {
  const types = [...new Set(rows.map((r) => r.type).filter(Boolean))];
  const ambiguous = rows.length >= 2 && types.length >= 2;
  const kind = rows.length === 0 ? "none" : ambiguous ? "ambiguous" : "hit";
  const records = rows.map(minimizeRecord);
  return { kind, records, exists: records.length > 0, types, ambiguous, matchKeyPrefix: key ? key.slice(0, 8) : "" };
}

/** matchKey로만 조회 — 본인 경로(토큰-only). vault 복호 불필요. */
export async function checkRiskByKey(matchKey, { actor = "anonymous" } = {}) {
  const key = String(matchKey || "").trim();
  if (!key) {
    return { kind: "none", records: [], exists: false, types: [], ambiguous: false, error: "invalid_key" };
  }

  const { ready, db } = getAdmin();
  let rows = [];
  if (ready) {
    const snap = await db.collection("risks").where("matchKey", "==", key).where("status", "==", "active").get();
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } else {
    rows = mockListRisksByKey(key);
  }

  const result = summarizeRows(rows, key);
  await writeAudit({
    action: "check",
    actor,
    meta: { matchKeyPrefix: result.matchKeyPrefix, kind: result.kind, count: result.records.length },
  });
  const { matchKeyPrefix: _, ...out } = result;
  void _;
  return out;
}

export async function checkRisk({ name, birth, actor = "anonymous" }) {
  const key = makeMatchKey(name, birth);
  if (!key) {
    return { kind: "none", records: [], exists: false, types: [], ambiguous: false, error: "invalid_identity" };
  }
  return checkRiskByKey(key, { actor });
}

export async function registerRisk(data, actor = "member") {
  const key = makeMatchKey(data.name, data.birth);
  if (!key) throw Object.assign(new Error("이름·생년월일이 올바르지 않습니다."), { status: 400 });

  const name = String(data.name || "").trim();
  const birth = cleanBirth(data.birth);
  const phone = data.phone || "";
  const ownerCompanyId = data.ownerCompanyId || "";
  const subjectUserId = data.subjectUserId || "";

  const piiRef = await upsertPiiVault({
    matchKey: key,
    subjectUserId,
    fields: {
      name,
      birth,
      phone,
      license: data.license || "",
      reason: data.reason || "",
    },
  });

  const payload = {
    matchKey: key,
    phone_lookup_token: phoneLookupToken(phone),
    piiRef,
    type: data.type,
    vertical: data.vertical || "rent",
    company: data.company || "미입력", // 등록 회원사 표시명(정보주체 PII 아님)
    evidence: data.evidence || "",
    status: "active",
    ownerCompanyId,
    subjectUserId,
    company_user_token: subjectUserId && ownerCompanyId
      ? await mintCompanyUserToken(ownerCompanyId, subjectUserId)
      : "",
  };

  const { ready, db } = getAdmin();
  let id;
  if (ready) {
    const ref = await db.collection("risks").add({
      ...payload,
      createdAt: new Date(),
    });
    id = ref.id;
  } else {
    id = mockAddRisk(payload);
  }

  await writeAudit({
    action: "register",
    actor,
    meta: { riskId: id, type: payload.type, company: payload.company, matchKeyPrefix: key.slice(0, 8) },
  });
  return { id };
}

/** 관리자용 — Phase 6 전까지 가명·마스킹 뷰(복호 안 함) */
export async function listAllRisks() {
  const { ready, db } = getAdmin();
  let rows;
  if (ready) {
    const snap = await db.collection("risks").orderBy("createdAt", "desc").get();
    rows = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || data.createdAt || 0,
      };
    });
  } else {
    rows = mockListAllRisks();
  }
  // 평문 PII 필드가 남아 있어도(레거시) 응답에서 제거
  return rows.map((r) => {
    const {
      name, birth, phone, license, reason,
      subjectUserId, matchKey, piiRef,
      ...rest
    } = r;
    void name; void birth; void phone; void license; void reason; void subjectUserId; void matchKey; void piiRef;
    return {
      ...rest,
      id: r.id,
      type: r.type,
      vertical: r.vertical,
      company: r.company,
      status: r.status,
      company_user_token: r.company_user_token || "",
      ownerCompanyId: r.ownerCompanyId || "",
      createdAt: r.createdAt,
      nameMasked: "○".repeat(2),
    };
  });
}

/** 소명 승인 — matchKey로 active risks → resolved */
export async function resolveAppealServer(appeal) {
  const name = String(appeal.name || "").trim();
  const birth = cleanBirth(appeal.birth);
  const { ready, db } = getAdmin();
  const key = makeMatchKey(name, birth);

  if (ready) {
    if (appeal.id) {
      await db.collection("appeals").doc(appeal.id).update({ status: "resolved", resolvedAt: new Date() });
    }
    if (key) {
      const byKey = await db.collection("risks").where("matchKey", "==", key).where("status", "==", "active").get();
      await Promise.all(byKey.docs.map((d) => d.ref.update({ status: "resolved", resolvedAt: new Date() })));
    }
  } else {
    mockResolveAppeal(appeal.id, name, birth);
  }

  await writeAudit({
    action: "resolve_appeal",
    actor: "admin",
    meta: { appealId: appeal.id || "", matchKeyPrefix: key ? key.slice(0, 8) : "" },
  });
}
