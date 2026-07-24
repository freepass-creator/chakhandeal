// 동의 완료 + 사진 증빙 서버 저장
import { getAdmin } from "./admin";
import { makeMatchKey } from "./matchKey";
import { mockAddConsent } from "./mockStore";
import { writeAudit } from "./audit";
import { checkRisk } from "./risks";

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

async function uploadDataUrl(bucket, path, dataUrl) {
  if (!dataUrl || !String(dataUrl).startsWith("data:")) return dataUrl || "";
  if (!bucket) return dataUrl; // Admin Storage 없으면 dataURL 유지(로컬)
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return dataUrl;
  const contentType = m[1] || "image/jpeg";
  const buffer = Buffer.from(m[2], "base64");
  const file = bucket.file(path);
  await file.save(buffer, { contentType, metadata: { cacheControl: "private, max-age=0" } });
  // 공개 URL 금지 — 짧은 서명 URL만 (실패 시 dataURL 유지, 공개 버킷 URL 폴백 없음)
  try {
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1시간
    });
    return url;
  } catch {
    return dataUrl;
  }
}

export async function completeConsent(body, actor = "guest") {
  const name = String(body.name || "").trim();
  const birth = body.verified?.birth || body.birth || "";
  const matchKey = makeMatchKey(name, birth);

  // 확인서(cert) — 서버에서 재계산 (클라이언트 위조 방지)
  const q = await checkRisk({ name, birth, actor: `${actor}:consent-cert` });
  const cert = {
    unresolved: q.kind === "hit" || q.kind === "ambiguous",
    count: (q.records || []).length,
    types: q.types || [],
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

  const doc = {
    name,
    phone: body.phone || "",
    company: body.company || "",
    code: body.code || "",
    status: "completed",
    verified: {
      name,
      birth: String(birth).replace(/\D/g, "").slice(0, 6),
      method: body.verified?.method || body.method || "unknown",
      verifiedAt: new Date().toISOString(),
    },
    matchKey: matchKey || "",
    signed: !!body.signed,
    cert,
    photos,
    self: true,
    createdAt: new Date(),
    completedAt: new Date(),
  };

  if (ready) {
    await db.collection("consents").doc(consentId).set(doc);
  } else {
    mockAddConsent({ ...doc, id: consentId });
  }

  await writeAudit({
    action: "consent",
    actor,
    meta: { consentId, company: doc.company, unresolved: cert.unresolved },
  });

  return { id: consentId, cert };
}
