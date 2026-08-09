"use client";

import { useParams, notFound } from "next/navigation";
import SignFlowByContract from "@/components/SignFlowByContract";

/**
 * `/{계약ID}` — 손님에게 나가는 계약 링크. 가장 짧은 형태.
 *
 * 도메인이 이미 `sign.` 이라 경로에 `sign`·`s` 를 또 붙이지 않는다.
 *   처음  /sign?c=chd_fpvaVLXkNOdrcmnuDCRu3w   68자
 *   지금  /fpvaVLXkNOdrcmnuDCRu3w              49자
 *
 * **여기서 더 줄이지 않는다.** 이 문자열이 계약을 지키는 자물쇠다 —
 * 계약번호처럼 추측 가능한 값으로 바꾸면 남의 계약 내용(이름·차량·금액)이 열린다.
 * 22자 랜덤 = 128비트라 대입이 불가능하다.
 *
 * 최상위 catch-all 이지만 `/consent`·`/go`·`/v`·`/admin` 같은 «정적» 경로가
 * Next.js 규칙상 우선하므로 기존 URL 은 그대로 산다.
 * 계약 ID 모양이 아닌 값은 404 로 떨군다 — 오타 경로가 「계약 없음」으로 보이면 헷갈린다.
 */
const ID_SHAPE = /^(chd_)?[A-Za-z0-9_-]{18,32}$/;

export default function ContractLinkPage() {
  const params = useParams();
  const raw = String(params?.id || "");
  if (!ID_SHAPE.test(raw)) notFound();
  // `chd_` 접두사는 URL 에서 빼서 보낸다(4자 절약). 붙어 온 것도 받는다.
  const contractId = raw.startsWith("chd_") ? raw : `chd_${raw}`;
  return <SignFlowByContract contractId={contractId} />;
}
