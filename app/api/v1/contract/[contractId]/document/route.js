import { NextResponse } from "next/server";
import { getContractInstance } from "@/lib/server/contractInstances";
import { requireVerifiedSubject } from "@/lib/server/authz";
import { renderContractDocument } from "@/lib/server/contractDocument";
import { issueDocumentTicket, verifyDocumentTicket } from "@/lib/server/documentTicket";
import { readAsDataUrl } from "@/lib/server/blobStore";
import { requireApiKey } from "@/lib/server/apiKeys";
import { resolveActor } from "@/lib/server/session";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";
import { writeAudit } from "@/lib/server/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 서명이 끝난 계약의 A4 계약서.
 *
 *  POST … /document        본인확인 토큰(또는 회원사 ApiKey) → 10분짜리 열람표
 *  GET  … /document?t=…    표를 확인하고 A4 계약서 HTML (브라우저에서 PDF로 저장)
 *
 * 계약서에는 이름·주소·계좌·금액이 다 들어 있다. 링크만 알면 열리는 문서가 되면 안 된다.
 * 그래서 GET 도 표 없이는 열리지 않는다.
 */

async function loadSigned(contractId) {
  const inst = await getContractInstance(contractId);
  if (!inst) throw Object.assign(new Error("계약을 찾을 수 없습니다."), { status: 404 });
  if (inst.status !== "signed") {
    // 서명 전 문서를 계약서로 내보내면 「서명 안 한 계약서」가 밖을 돌아다닌다.
    throw Object.assign(new Error("아직 서명이 끝나지 않은 계약입니다."), { status: 409, code: "NOT_SIGNED" });
  }
  return inst;
}

export async function POST(req, { params }) {
  const ip = clientIp(req);
  if (!rateLimit(`doc-ticket:${ip}`, { limit: 20, windowMs: 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const contractId = String(params?.contractId || "").trim();
  const body = await req.json().catch(() => ({}));

  try {
    const inst = await loadSigned(contractId);

    /*
     * 계약서를 열 수 있는 사람은 셋뿐이다.
     *   ① 발행한 회원사 — ApiKey
     *   ② 관리자 — 공급사가 아직 시스템을 못 쓰므로 확인을 대신한다
     *   ③ 서명한 본인 — 본인확인 토큰
     * 그 밖에는 링크를 알아도 열리지 않는다.
     */
    const auth = await requireApiKey(req).catch(() => null);
    const admin = auth ? null : await resolveActor(req).catch(() => null);
    let actor;
    if (auth?.memberCompany && auth.memberCompany === inst.memberCompany) {
      actor = `apikey:${auth.memberCompany}`;
    } else if (admin?.role === "admin") {
      actor = `admin:${admin.email || admin.userId || ""}`;
    } else {
      const subject = await requireVerifiedSubject(req, body, {
        endpoint: `/api/v1/contract/${contractId}/document`,
      });
      // 서명한 «그 사람»인지 본다. 본인확인만 했다고 남의 계약서를 열 수는 없다.
      const signedBy = String(inst.matchKey || "");
      if (signedBy && subject.matchKey && signedBy !== subject.matchKey) {
        await writeAudit({
          action: "contract_document_deny",
          actor: subject.userId,
          meta: { contractId, reason: "subject_mismatch", ip },
        });
        return NextResponse.json(
          { ok: false, error: "이 계약의 계약자만 열 수 있습니다.", code: "SIGNER_MISMATCH" },
          { status: 403 },
        );
      }
      actor = subject.userId;
    }

    const { ticket, expiresAt } = issueDocumentTicket(contractId);
    await writeAudit({
      action: "contract_document_issue",
      actor,
      meta: { contractId, externalRef: inst.externalRef, ip },
    });

    return NextResponse.json({
      ok: true,
      url: `/api/v1/contract/${encodeURIComponent(contractId)}/document?t=${encodeURIComponent(ticket)}`,
      expiresAt,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "계약서를 준비하지 못했습니다.", code: e?.code },
      { status: e?.status || 500 },
    );
  }
}

export async function GET(req, { params }) {
  const ip = clientIp(req);
  if (!rateLimit(`doc-view:${ip}`, { limit: 40, windowMs: 60_000 }).ok) {
    return new NextResponse("요청이 너무 많습니다.", { status: 429 });
  }

  const contractId = String(params?.contractId || "").trim();
  const ticket = new URL(req.url).searchParams.get("t") || "";

  try {
    if (!verifyDocumentTicket(ticket, contractId)) {
      return new NextResponse("계약서 열람 시간이 지났습니다. 계약 링크에서 다시 열어 주세요.", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const inst = await loadSigned(contractId);
    // 서명 이미지는 링크를 만들지 않고 문서 안에 직접 넣는다.
    const signatureImageUrl = await readAsDataUrl(inst.signaturePath);
    const html = await renderContractDocument({ ...inst, signatureImageUrl });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // 계약서가 캐시·프록시·검색엔진에 남지 않게 한다.
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return new NextResponse(e?.message || "계약서를 열 수 없습니다.", {
      status: e?.status || 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
