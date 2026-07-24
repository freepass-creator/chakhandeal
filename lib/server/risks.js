// 위험 매칭 / 등록 — Admin 또는 mock. 클라이언트는 이 레이어를 직접 import 하지 않음(API 경유).
import { getAdmin } from "./admin";
import { makeMatchKey } from "./matchKey";
import { cleanBirth } from "@/lib/format";
import { mockListRisksByKey, mockAddRisk, mockListAllRisks, mockResolveAppeal } from "./mockStore";
import { writeAudit } from "./audit";

function minimizeRecord(r) {
  return {
    id: r.id,
    type: r.type,
    vertical: r.vertical || "rent",
    company: r.company || "",
    status: r.status || "active",
  };
}

/** @returns {{ kind: 'none'|'hit'|'ambiguous', records: object[], exists: boolean, types: string[], ambiguous: boolean }} */
export async function checkRisk({ name, birth, actor = "anonymous" }) {
  const key = makeMatchKey(name, birth);
  if (!key) {
    return { kind: "none", records: [], exists: false, types: [], ambiguous: false, error: "invalid_identity" };
  }

  const { ready, db } = getAdmin();
  let rows = [];
  if (ready) {
    const snap = await db.collection("risks").where("matchKey", "==", key).where("status", "==", "active").get();
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // 레거시(평문만 있는 문서) 폴백 — 마이그레이션 전
    if (rows.length === 0) {
      const legacy = await db.collection("risks").where("name", "==", String(name || "").trim()).where("status", "==", "active").get();
      rows = legacy.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => cleanBirth(r.birth) === cleanBirth(birth));
    }
  } else {
    rows = mockListRisksByKey(key);
  }

  const types = [...new Set(rows.map((r) => r.type).filter(Boolean))];
  const ambiguous = rows.length >= 2 && types.length >= 2;
  const kind = rows.length === 0 ? "none" : ambiguous ? "ambiguous" : "hit";
  const records = rows.map(minimizeRecord);

  await writeAudit({
    action: "check",
    actor,
    meta: { matchKeyPrefix: key.slice(0, 8), kind, count: records.length },
  });

  return { kind, records, exists: records.length > 0, types, ambiguous };
}

export async function registerRisk(data, actor = "member") {
  const key = makeMatchKey(data.name, data.birth);
  if (!key) throw Object.assign(new Error("이름·생년월일이 올바르지 않습니다."), { status: 400 });

  const payload = {
    matchKey: key,
    name: String(data.name || "").trim(),
    birth: cleanBirth(data.birth),
    type: data.type,
    vertical: data.vertical || "rent",
    license: data.license || "",
    phone: data.phone || "",
    company: data.company || "미입력",
    reason: data.reason || "",
    evidence: data.evidence || "",
    status: "active",
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

/** 관리자용 전체 목록 (평문 포함 — 콘솔 전용) */
export async function listAllRisks() {
  const { ready, db } = getAdmin();
  if (ready) {
    const snap = await db.collection("risks").orderBy("createdAt", "desc").get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || data.createdAt || 0,
      };
    });
  }
  return mockListAllRisks();
}

/** 소명 승인 — appeal resolved + 동일 신원 active risks → resolved */
export async function resolveAppealServer(appeal) {
  const name = String(appeal.name || "").trim();
  const birth = cleanBirth(appeal.birth);
  const { ready, db } = getAdmin();

  if (ready) {
    if (appeal.id) {
      await db.collection("appeals").doc(appeal.id).update({ status: "resolved", resolvedAt: new Date() });
    }
    const key = makeMatchKey(name, birth);
    if (key) {
      const byKey = await db.collection("risks").where("matchKey", "==", key).where("status", "==", "active").get();
      await Promise.all(byKey.docs.map((d) => d.ref.update({ status: "resolved", resolvedAt: new Date() })));
    }
    const legacy = await db.collection("risks").where("name", "==", name).where("status", "==", "active").get();
    await Promise.all(
      legacy.docs
        .filter((d) => cleanBirth(d.data().birth) === birth)
        .map((d) => d.ref.update({ status: "resolved", resolvedAt: new Date() }))
    );
  } else {
    mockResolveAppeal(appeal.id, name, birth);
  }

  await writeAudit({
    action: "resolve_appeal",
    actor: "admin",
    meta: { appealId: appeal.id || "", name, birth },
  });
}
