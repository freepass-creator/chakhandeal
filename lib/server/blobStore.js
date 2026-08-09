// dataURL → Storage(또는 로컬 .data) 저장. 공개 URL 금지 — 경로만 반환.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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

/**
 * 저장한 파일을 다시 dataURL 로 꺼낸다 — 계약서 인쇄본에 서명 이미지를 «박아 넣기» 위해서다.
 *
 * 공개 URL 을 만들지 않는다. 버킷은 public-access-prevention 이 걸려 있고,
 * 서명 이미지에 링크가 생기면 그 링크를 아는 누구나 볼 수 있게 된다.
 * 인증을 통과한 요청에 한해 서버가 바이트를 읽어 문서 안에 직접 넣는다.
 *
 * @returns {Promise<string>} `data:image/png;base64,…` (없으면 빈 문자열)
 */
export async function readAsDataUrl(path, fallbackType = "image/png") {
  const p = String(path || "").trim();
  if (!p) return "";
  if (p.startsWith("data:")) return p;   // 데모 폴백으로 dataURL 이 그대로 저장된 경우

  const { ready, bucket } = getAdmin();
  if (ready && bucket) {
    try {
      const file = bucket.file(p);
      const [buf] = await file.download();
      const [meta] = await file.getMetadata().catch(() => [{}]);
      return `data:${meta?.contentType || fallbackType};base64,${buf.toString("base64")}`;
    } catch {
      return "";
    }
  }

  const abs = join(DATA_ROOT, p);
  if (!existsSync(abs)) return "";
  return `data:${fallbackType};base64,${readFileSync(abs).toString("base64")}`;
}
