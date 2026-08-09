// Firestore 없을 때 프로세스 재시작에도 남는 JSON 파일 저장소 (.data/)
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), ".data");

function ensureDir() {
  if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true });
}

function pathFor(name) {
  ensureDir();
  return join(ROOT, `${name}.json`);
}

export function durableRead(name, fallback) {
  const p = pathFor(name);
  if (!existsSync(p)) return typeof fallback === "function" ? fallback() : fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return typeof fallback === "function" ? fallback() : fallback;
  }
}

export function durableWrite(name, value) {
  const p = pathFor(name);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 0), "utf8");
  renameSync(tmp, p);
}
