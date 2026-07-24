"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 구 경로 /pet/v → 공통 /v 로 이전 */
export default function PetVerifyRedirect() {
  const router = useRouter();
  useEffect(() => {
    const q = window.location.search || "";
    router.replace(`/v${q}`);
  }, [router]);
  return (
    <div className="app">
      <div className="c-body"><div className="hint">상태 확인으로 이동 중…</div></div>
    </div>
  );
}
