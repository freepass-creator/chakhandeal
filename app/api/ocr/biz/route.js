/**
 * 사업자등록증 OCR — Gemini 기반(회원사 가입 자동입력용). POST /api/ocr/biz (multipart, file)
 *   → { ok:true, company, bizNo, ceo, industry } | { ok:false, error }
 * 이미지/PDF 지원. 추출 후 미저장.
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
    company: { type: Type.STRING, nullable: true, description: "상호 / 법인명" },
    bizNo: { type: Type.STRING, nullable: true, description: "사업자등록번호 XXX-XX-XXXXX" },
    ceo: { type: Type.STRING, nullable: true, description: "대표자 성명(한글)" },
    industry: { type: Type.STRING, nullable: true, description: "업태/종목 (여러 개면 콤마)" },
  },
  required: ["company", "bizNo", "ceo", "industry"],
};

const PROMPT = `이 이미지는 한국 사업자등록증입니다. 아래만 추출하세요.
- company: 상호(법인명). 괄호 안 영문은 제외 (예: "스피드렌탈 주식회사 (Speed Co.,Ltd)" → "스피드렌탈 주식회사").
- bizNo: 사업자등록번호 (XXX-XX-XXXXX 형식).
- ceo: 대표자 성명 (한글 이름만).
- industry: 업태/종목 (여러 개면 콤마로 연결).
값이 없으면 null.`;

export async function POST(req) {
  const ip = clientIp(req);
  const rl = rateLimit(`ocr-biz:${ip}`, { limit: 15, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  let file;
  try { file = (await req.formData()).get("file"); }
  catch { return NextResponse.json({ ok: false, error: "FormData 파싱 실패" }, { status: 400 }); }
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "file 누락" }, { status: 400 });
  }
  try {
    const p = await extractFromImage({ file, schema: SCHEMA, prompt: PROMPT, maxBytes: 15 * 1024 * 1024 });
    return NextResponse.json({ ok: true, company: p.company || "", bizNo: p.bizNo || "", ceo: p.ceo || "", industry: p.industry || "" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err?.message || "OCR 실패" }, { status: err?.status || 500 });
  }
}
