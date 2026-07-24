"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 레거시 — 이력 확인은 내 상태 보내기(/go)로 통합 */
export default function MyStatus() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/go");
  }, [router]);
  return (
    <div className="app">
      <div className="c-body"><div className="hint">내 상태 보내기로 이동 중…</div></div>
    </div>
  );
}
