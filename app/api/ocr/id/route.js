/**
 * 신분증 OCR — Gemini 기반. POST /api/ocr/id (multipart, file)
 *   → { ok:true, name, birth(YYMMDD), doc } | { ok:false, error }
 * 이름·생년월일만 추출(주민번호 뒷자리·면허번호·주소 등 미수집). 이미지 미저장.
 */
import { NextResponse } from "next/server";
import { Type } from "@google/genai";
import { extractFromImage } from "@/lib/gemini";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, nullable: true, description: "성명 (한글 이름)" },
    birth: { type: Type.STRING, nullable: true, description: "생년월일 6자리 YYMMDD (주민등록번호 앞 6자리)" },
    doc: { type: Type.STRING, nullable: true, description: "신분증 종류: 주민등록증 | 운전면허증 | 기타" },
  },
  required: ["name", "birth", "doc"],
};

const PROMPT = `이 이미지는 한국 신분증(주민등록증 또는 운전면허증)입니다. 아래 세 가지만 추출하세요.
- name: 성명 (한글 이름)
- birth: 생년월일 6자리 (YYMMDD) — 주민등록번호 앞 6자리
- doc: 신분증 종류 ("주민등록증" / "운전면허증" / "기타")

⚠️ 주민등록번호 뒷자리, 면허번호, 발급일자, 주소 등 그 외 정보는 절대 추출하거나 반환하지 마세요.
신분증이 아니거나 글자를 읽을 수 없으면 모든 값을 null 로 반환하세요.`;

export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`ocr-id:${ip}`, { limit: 15, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let file;
  try { file = (await req.formData()).get("file"); }
  catch { return NextResponse.json({ ok: false, error: "FormData 파싱 실패" }, { status: 400 }); }
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "file 누락" }, { status: 400 });
  }
  const mime = file.type || "";
  if (mime && !mime.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "이미지 파일만 허용" }, { status: 400 });
  }
  try {
    const p = await extractFromImage({ file, schema: SCHEMA, prompt: PROMPT });
    const birth = String(p.birth || "").replace(/\D/g, "").slice(0, 6);
    return NextResponse.json({ ok: true, name: p.name || "", birth, doc: p.doc || "" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err?.message || "OCR 실패" }, { status: err?.status || 500 });
  }
}
