"use client";

import { useEffect, useState } from "react";
import { tap } from "@/lib/haptic";

// 홈 화면에 앱 설치 — beforeinstallprompt(안드/데스크톱) + iOS/수동 안내 폴백
export default function InstallButton() {
  const [deferred, setDeferred] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [guide, setGuide] = useState("");

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone) { setHidden(true); return; } // 이미 설치/앱 실행 중이면 숨김
    const onBIP = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

  const onClick = async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setHidden(true);
      setDeferred(null);
    } else {
      const ua = navigator.userAgent || "";
      setGuide(
        /iphone|ipad|ipod/i.test(ua)
          ? "Safari 하단 공유 버튼 → ‘홈 화면에 추가’를 누르면 설치됩니다."
          : "브라우저 메뉴(⋮) → ‘앱 설치’ 또는 ‘홈 화면에 추가’를 누르면 설치됩니다."
      );
    }
  };

  return (
    <>
      <button type="button" className="install-btn" onClick={tap(onClick)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 11l5 5 5-5M5 21h14" /></svg>
        앱 설치하기
      </button>
      {guide && <p className="install-guide">{guide}</p>}
    </>
  );
}
