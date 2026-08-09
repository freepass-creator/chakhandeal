// dataURL → Storage(또는 로컬 .data) 저장. 공개 URL 금지 — 경로만 반환.
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getAdmin } from "./admin";

const DATA_ROOT = join(process.cwd(), ".data");

/**
 * @param {string} path 저장 상대 경로 (예: contracts/chd_xxx/sig.png)
 * @param {string} dataUrl data:…;base64,…
 * @returns {Promise<string>} 저장 경로(또는 버킷 없을 때 dataURL — 데모 폴백)
 */
export async function saveDataUrl(path, dataUrl) {
  if (!dataUrl || !String(dataUrl).startsWith("data:")) return dataUrl || "";
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return dataUrl;
  const contentType = m[1] || "application/octet-stream";
  const buffer = Buffer.from(m[2], "base64");
  const { ready, bucket } = getAdmin();

  if (ready && bucket) {
    const file = bucket.file(path);
    await file.save(buffer, { contentType, metadata: { cacheControl: "private, max-age=0" } });
    return path;
  }

  const abs = join(DATA_ROOT, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, buffer);
  return path;
}
