"use client";

import { useEffect } from "react";

// 서비스워커 등록 — 구버전 캐시(옛 HTML)가 남아 버튼이 죽은 것처럼 보이지 않게 갱신.
export default function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (cancelled) return;
        await reg.update().catch(() => {});
        // 대기 중인 워커가 있으면 바로 활성화
        if (reg.waiting) reg.waiting.postMessage?.({ type: "SKIP_WAITING" });
        reg.waiting?.postMessage?.({ type: "SKIP_WAITING" });
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
