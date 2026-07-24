"use client";

import { useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";

const SEEN_KEY = "cd_intro_seen_v1";

/**
 * 첫 방문 안내 — 짧게. 「확인」하면 다시 안 뜸.
 */
export default function IntroOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone) return;
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
    setOpen(false);
  };

  return (
    <div className="intro-backdrop" role="dialog" aria-modal="true" aria-label="착한거래 안내" onClick={close}>
      <div className="intro-sheet intro-sheet-short" onClick={(e) => e.stopPropagation()}>
        <div className="intro-scroll"><div className="intro-inner">
          <div className="intro-head">
            <BrandMark size={28} className="intro-mark" />
            <h2 className="intro-title"><span className="accent">착한</span>거래</h2>
            <p className="intro-tagline">이번 거래에 동의하고,<br />내 상태를 확인한 뒤 보내면 됩니다.</p>
          </div>

          <ul className="intro-vals">
            <li>
              <b>이번 거래에 동의</b>
              <span>요청자가 보낸 링크로 들어오거나, 코드로 상대를 확인하고 동의합니다.</span>
            </li>
            <li>
              <b>내 상태 보내기</b>
              <span>먼저 내 상태를 확인하고, 필요할 때 링크로 보냅니다.</span>
            </li>
            <li>
              <b>회원은 로그인 후</b>
              <span>동의 요청 링크는 회원 콘솔에서 보냅니다.</span>
            </li>
          </ul>
        </div></div>

        <button type="button" className="intro-ok" onClick={close}>알겠어요</button>
        <p className="intro-once">이 안내는 처음 한 번만 보여 드려요.</p>
      </div>
    </div>
  );
}
