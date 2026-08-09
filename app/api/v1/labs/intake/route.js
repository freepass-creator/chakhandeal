import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync, renameSync } from "fs";
import { join } from "path";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 테스트용 파일 수신 — «파일이 어떻게 오는지»를 눈으로 보기 위한 것.
 *
 * 운영 경로가 아니다. 인증이 없으므로 DEMO_MODE 에서만 열린다.
 * 실제 계약 파일은 `/api/v1/contract/[contractId]/guest` 가 본인확인 토큰을 걸고 받는다.
 */
const LABS_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
const ROOT = join(process.cwd(), ".data", "labs");
const MAX_BYTES = 12 * 1024 * 1024;

/** 경로 조작 차단 — 파일명에 쓸 수 있는 문자만 남긴다. */
function safe(s, fallback) {
  const v = String(s || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return v || fallback;
}

const EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

function manifestPath(sessionId) {
  return join(ROOT, sessionId, "manifest.json");
}

function readManifest(sessionId) {
  const p = manifestPath(sessionId);
  if (!existsSync(p)) return { sessionId, items: [] };
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return { sessionId, items: [] };
  }
}

function writeManifest(sessionId, m) {
  const p = manifestPath(sessionId);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(m, null, 2), "utf8");
  renameSync(tmp, p);
}

export async function POST(req) {
  if (!LABS_ENABLED) {
    return NextResponse.json({ ok: false, error: "labs 비활성" }, { status: 404 });
  }

  const ip = clientIp(req);
  const rl = rateLimit(`labs-intake:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 파싱 실패" }, { status: 400 });
  }

  const sessionId = safe(body?.sessionId, "");
  const key = safe(body?.key, "");
  const dataUrl = String(body?.dataUrl || "");
  if (!sessionId || !key) {
    return NextResponse.json({ ok: false, error: "sessionId·key 필요" }, { status: 400 });
  }

  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) {
    return NextResponse.json({ ok: false, error: "dataURL 형식이 아닙니다." }, { status: 400 });
  }

  const contentType = m[1];
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `파일이 너무 큽니다 (${Math.round(buffer.length / 1024)}KB / 최대 ${MAX_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }

  const ext = EXT[contentType] || "bin";
  const manifest = readManifest(sessionId);
  const seq = manifest.items.filter((x) => x.key === key).length + 1;
  const rel = `${key}-v${seq}.${ext}`;
  const dir = join(ROOT, sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, rel), buffer);

  const item = {
    key,
    version: seq,
    // 원본을 덮어쓰지 않고 v1·v2 로 쌓는다 — 보완 요청 시 이력이 남아야 한다.
    storagePath: `labs/${sessionId}/${rel}`,
    contentType,
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    receivedAt: Date.now(),
  };
  manifest.items.push(item);
  writeManifest(sessionId, manifest);

  return NextResponse.json({ ok: true, received: item, total: manifest.items.length });
}

export async function GET(req) {
  if (!LABS_ENABLED) {
    return NextResponse.json({ ok: false, error: "labs 비활성" }, { status: 404 });
  }
  const sessionId = safe(new URL(req.url).searchParams.get("sessionId"), "");
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId 필요" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, manifest: readManifest(sessionId) });
}
