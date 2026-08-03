// 동의 완료 + 사진 증빙 서버 저장
import { getAdmin } from "./admin";
import { mockAddConsent, mockFindMemberByCode } from "./mockStore";
import { writeAudit } from "./audit";
import { checkRiskByKey, filterRecordsByVertical } from "./risks";
import { buildCertificateDraft, submitCertificate } from "./certificate";
import { companyIdForCode } from "./ids";
import { DEMO_MEMBERS } from "@/lib/constants";

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

// ownerCompanyId는 거래코드(code)에서만 유도한다. 클라가 보낸 상호명으로는 유도하지 않는다 —
// 그러면 코드 없이 상호만으로 특정 회사 콘솔에 레코드를 꽂아넣는 조향 표면이 됨(isOwnerCompany 오염).
async function resolveOwnerCompanyId(code) {
  const byCode = companyIdForCode(code);
  if (byCode) return byCode;
  const demo = DEMO_MEMBERS.find((m) => m.code === code);
  if (demo?.companyId) return demo.companyId;
  const mock = mockFindMemberByCode(code);
  if (mock?.companyId) return mock.companyId;
  const { ready, db } = getAdmin();
  if (ready && code) {
    try {
      const snap = await db.collection("members").where("code", "==", code).where("status", "==", "approved").limit(1).get();
      if (!snap.empty) return snap.docs[0].data()?.companyId || "";
    } catch { /* ignore */ }
  }
  return "";
}

async function uploadDataUrl(bucket, path, dataUrl) {
  if (!dataUrl || !String(dataUrl).startsWith("data:")) return dataUrl || "";
  if (!bucket) return dataUrl;
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return dataUrl;
  const contentType = m[1] || "image/jpeg";
  const buffer = Buffer.from(m[2], "base64");
  const file = bucket.file(path);
  await file.save(buffer, { contentType, metadata: { cacheControl: "private, max-age=0" } });
  try {
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });
    return url;
  } catch {
    return dataUrl;
  }
}

/**
 * @param {object} body
 * @param {string} actor
 * @param {{ userId: string, matchKey: string, method: string }} subjectToken — 필수(토큰-only)
 */
export async function completeConsent(body, actor = "guest", subjectToken) {
  if (!subjectToken?.userId || !subjectToken?.matchKey) {
    throw Object.assign(new Error("본인확인이 필요합니다."), { status: 401, code: "AUTH_REQUIRED" });
  }

  const name = String(body.name || "").trim();
  const birth = String(body.verified?.birth || body.birth || "").replace(/\D/g, "").slice(0, 6);
  const matchKey = subjectToken.matchKey;
  const subjectUserId = subjectToken.userId;

  const vertical = body.vertical || "rent";
  const q = await checkRiskByKey(matchKey, { actor: `${actor}:consent-cert` });
  const scoped = filterRecordsByVertical(q.records, vertical);
  const cert = {
    unresolved: scoped.length > 0,
    count: scoped.length,
    types: [...new Set(scoped.map((r) => r.type).filter(Boolean))],
  };

  const { ready, db, bucket } = getAdmin();
  const consentId = ready ? db.collection("consents").doc().id : `cs_${rid()}`;
  const photoBase = `consent_photos/${consentId}`;

  let photos = { id: "", face: "" };
  if (body.photos?.id || body.idImage) {
    photos.id = await uploadDataUrl(bucket, `${photoBase}/id.jpg`, body.photos?.id || body.idImage);
  }
  if (body.photos?.face || body.faceImage) {
    photos.face = await uploadDataUrl(bucket, `${photoBase}/face.jpg`, body.photos?.face || body.faceImage);
  }

  const ownerCompanyId = await resolveOwnerCompanyId(body.code || "");

  const doc = {
    name,
    phone: body.phone || "",
    company: body.company || "",
    code: body.code || "",
    vertical,
    status: "completed",
    verified: {
      name,
      birth,
      method: body.verified?.method || body.method || subjectToken.method || "unknown",
      verifiedAt: new Date().toISOString(),
    },
    matchKey,
    signed: !!body.signed,
    cert,
    photos,
    self: true,
    ownerCompanyId,
    subjectUserId,
    createdAt: new Date(),
    completedAt: new Date(),
  };

  if (ready) {
    await db.collection("consents").doc(consentId).set(doc);
  } else {
    mockAddConsent({ ...doc, id: consentId });
  }

  let certId = "";
  if (doc.code) {
    try {
      const draft = await buildCertificateDraft({
        matchKey,
        vertical,
        method: doc.verified.method,
      });
      const sub = await submitCertificate({
        draft,
        provider: { code: doc.code, company: doc.company, service: body.service || "", vertical, companyId: ownerCompanyId },
        subject: { name, birth, phone: doc.phone, method: doc.verified.method, userId: subjectUserId, matchKey },
        signed: doc.signed,
      });
      certId = sub.id;
    } catch (e) {
      console.error("consent auto-cert", e);
    }
  }

  await writeAudit({
    action: "consent",
    actor,
    meta: { consentId, company: doc.company, unresolved: cert.unresolved, certId, ownerCompanyId, subjectUserId },
  });

  return { id: consentId, cert, certId };
}
