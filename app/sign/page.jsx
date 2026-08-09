"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SignFlowByContract from "@/components/SignFlowByContract";

/**
 * `/sign?c={contractId}` — **하위호환용.** 이미 나간 링크를 깨지 않기 위해 남긴다.
 * 지금 발급되는 링크는 더 짧은 `/{계약ID}` 다(도메인이 이미 `sign.` 이라 경로 중복을 없앰).
 *
 * `useSearchParams()` 는 프리렌더에서 값을 알 수 없어 Suspense 경계가 필요하다 —
 * 없으면 빌드가 «missing-suspense-with-csr-bailout» 으로 실패한다.
 */
export default function SignPage() {
  return (
    <Suspense fallback={<div className="app"><div className="c-body"><div className="skel" /><div className="skel" /></div></div>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  return <SignFlowByContract contractId={params.get("c") || ""} />;
}
