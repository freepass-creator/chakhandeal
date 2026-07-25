"use client";

import { useRouter } from "next/navigation";
import { CAMPAIGN_LEAD } from "@/lib/constants";
import Icon from "@/components/Icon";
import BrandMark from "@/components/BrandMark";
import InstallButton from "@/components/InstallButton";
import IntroOverlay from "@/components/IntroOverlay";

/**
 * 메인 — 선택만. 코드 입력·이전/다음은 각 플로우(/consent, /go)의 StepFooter 규격.
 */
export default function Landing() {
  const router = useRouter();

  return (
    <div className="land">
      <IntroOverlay />
      <div className="land-main">
        <div className="land-hero">
          <BrandMark size={34} className="land-mark" />
          <h1 className="land-title"><span className="accent">착한</span>거래</h1>
          <p className="land-cat">서로 확인하는 거래</p>
          <p className="land-lead">{CAMPAIGN_LEAD}</p>
        </div>

        <div className="land-cards">
          <button type="button" className="land-card primary" onClick={() => router.push("/consent")}>
            <span className="lc-ic"><Icon name="check" size={22} /></span>
            <span className="lc-tx">
              <b>동의 및 내 상태 보내기</b>
              <span>상대를 확인하고 동의하면, 내 상태도 함께 전달됩니다.</span>
            </span>
            <span className="lc-arrow">→</span>
          </button>

          <button type="button" className="land-card" onClick={() => router.push("/go")}>
            <span className="lc-ic"><Icon name="send" size={22} /></span>
            <span className="lc-tx">
              <b>내 상태 보기</b>
              <span>내 상태를 먼저 확인하고, 필요하면 링크로 보냅니다.</span>
            </span>
            <span className="lc-arrow">→</span>
          </button>
        </div>
      </div>

      <div className="land-foot">
        <button type="button" className="land-biz" onClick={() => router.push("/login")}>
          <Icon name="user" size={15} />회원 로그인
        </button>
        <InstallButton />
      </div>
    </div>
  );
}
