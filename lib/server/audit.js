// 감사 로그 — Admin Firestore audits 또는 mock
import { getAdmin } from "./admin";
import { mockAddAudit, mockListAudits } from "./mockStore";

export async function writeAudit({ action, actor = "anonymous", meta = {} }) {
  const payload = {
    action,
    actor,
    meta,
    at: new Date().toISOString(),
  };
  const { ready, db } = getAdmin();
  if (!ready) {
    mockAddAudit(payload);
    return;
  }
  try {
    await db.collection("audits").add({
      ...payload,
      createdAt: new Date(),
    });
  } catch (e) {
    console.error("audit write failed", e);
    mockAddAudit(payload);
  }
}

export async function listAudits(limit = 50) {
  const { ready, db } = getAdmin();
  if (!ready) return mockListAudits(limit);
  try {
    const snap = await db.collection("audits").orderBy("createdAt", "desc").limit(limit).get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        action: data.action,
        actor: data.actor,
        meta: data.meta || {},
        at: data.at || data.createdAt?.toDate?.()?.toISOString?.() || "",
        createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || 0,
      };
    });
  } catch (e) {
    console.error("listAudits", e);
    return mockListAudits(limit);
  }
}
