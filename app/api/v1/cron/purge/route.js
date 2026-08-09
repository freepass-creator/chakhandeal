import { NextResponse } from "next/server";
import { listPurgeDue, purgeContract } from "@/lib/server/contractInstances";
import { writeAudit } from "@/lib/server/audit";

export const runtime = "nodejs";
export const preferredRegion = "icn1";
export const maxDuration = 300;

/**
 * 보관기간이 지난 계약의 개인정보를 파기한다(개인정보보호법 §21 — 목적 달성 시 지체 없이 파기).
 *
 * 하루 한 번 Vercel Cron 이 부른다(`vercel.json`). 사람이 눌러야 도는 구조로 두면
 * 언젠가 안 누르고, 그때부터 «보유기간 초과 보관»이 된다.
 *
 * 인증: Vercel Cron 은 `Authorization: Bearer ${CRON_SECRET}` 를 붙여 온다.
 * CRON_SECRET 미설정이면 **아무도 못 부른다** — 열어두면 임의 파기 요청이 가능해진다.
 */
export async function POST(req) {
  const secret = process.env.CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  let due = [];
  try {
    due = await listPurgeDue({ now });
  } catch (e) {
    console.error("[purge] 대상 조회 실패", e);
    return NextResponse.json({ ok: false, error: e?.message || "조회 실패" }, { status: 500 });
  }

  const done = [];
  const failed = [];
  for (const inst of due) {
    try {
      await purgeContract(inst.contractId, { now });
      done.push(inst.contractId);
      // 무엇을 언제 지웠는지는 남긴다 — 파기 사실 자체가 입증 대상이다.
      await writeAudit({
        action: "pii_purge",
        actor: "cron",
        meta: {
          contractId: inst.contractId,
          memberCompany: inst.memberCompany || "",
          purgeAt: inst.purgeAt || null,
          signedAt: inst.signedAt || null,
        },
      });
    } catch (e) {
      console.error("[purge] 실패", inst.contractId, e);
      failed.push(inst.contractId);
    }
  }

  return NextResponse.json({ ok: true, checked: due.length, purged: done.length, failed: failed.length });
}

/** 상태 확인용 — 대상 «개수»만. 목록은 주지 않는다. */
export async function GET(req) {
  const secret = process.env.CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const due = await listPurgeDue({});
  return NextResponse.json({ ok: true, due: due.length });
}
