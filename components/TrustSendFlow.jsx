"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_VERTICAL, CODE_LABEL } from "@/lib/constants";
import { findMemberByCode } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import AuthFlow from "@/components/AuthFlow";
import StepFooter from "@/components/StepFooter";
import FlowHeader from "@/components/FlowHeader";

/**
 * 내 상태 보기 — 파이프라인 2단계만.
 *   1) 본인확인  2) 내 상태
 * 누군가에게 전달하고 싶을 때만 링크로 보냄 (단계 아님 · 선택).
 * 손님은 업종을 고르지 않음. ?code= 있으면 그 회원 업종.
 */
export default function TrustSendFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState("auth"); // auth | view | send(선택)
  const [verified, setVerified] = useState(null);
  const [draft, setDraft] = useState(null);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [provider, setProvider] = useState(null);
  const [boot, setBoot] = useState(false);

  /** 진행바는 본인확인(1)·내 상태(2)만. 전달 화면은 단계 밖 */
  const inPipeline = phase === "auth" || phase === "view";
  const step = phase === "view" ? 2 : 1;
  const vertical = provider?.vertical || DEFAULT_VERTICAL;

  useEffect(() => {
    let cancelled = false;
    try { sessionStorage.removeItem("cd_last_provider_code"); } catch { /* */ }

    (async () => {
      const code = (new URLSearchParams(window.location.search).get("code") || "").replace(/\D/g, "");
      if (code) {
        try {
          const m = await findMemberByCode(code);
          if (!cancelled && m) setProvider(m);
        } catch { /* */ }
      }
      if (!cancelled) setBoot(true);
    })();

    return () => { cancelled = true; };
  }, []);

  async function loadDraft(v) {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/cert/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: v.name,
          birth: v.birth,
          vertical,
          method: v.method,
        }),
      });
      const j = await r.json();
      if (j.ok && j.draft) {
        setDraft(j.draft);
        return true;
      }
      alert(j.error || "확인에 실패했습니다.");
      return false;
    } catch {
      alert("확인 중 오류가 발생했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onVerified(v) {
    setVerified(v);
    const ok = await loadDraft(v);
    if (ok) setPhase("view");
  }

  function buildShare(id) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${origin}/v?id=${encodeURIComponent(id)}`;
    return {
      shareUrl,
      shareText: `[착한거래] 내 상태 확인 링크입니다.\n\n${shareUrl}\n\n※ 캡처가 아니라 위 링크를 열어 확인해 주세요.`,
    };
  }

  async function prepareSend() {
    if (!verified || !draft) return;
    setBusy(true);
    try {
      const r = await fetch("/api/v1/cert/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: verified.name,
          birth: verified.birth,
          phone: verified.phone,
          method: verified.method,
          vertical,
          providerCode: provider?.code || "",
          signed: true,
        }),
      });
      const j = await r.json();
      if (!j.ok) { alert(j.error || "준비 실패"); return; }
      setIssued({ ...j, ...buildShare(j.id) });
      setPhase("send");
    } finally {
      setBusy(false);
    }
  }

  async function copyShare() {
    if (!issued?.shareUrl) return;
    try {
      await navigator.clipboard?.writeText(issued.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("복사에 실패했습니다. 아래 링크를 길게 눌러 복사해 주세요.");
    }
  }

  async function shareNative() {
    if (!issued) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "착한거래 상태 링크",
          text: "캡처가 아니라 링크를 열어 확인해 주세요.",
          url: issued.shareUrl,
        });
        return;
      } catch { /* fall through */ }
    }
    copyShare();
  }

  const header = (
    <FlowHeader
      title="내 상태 보기"
      sub={
        phase === "send" ? "링크로 전달 (선택)"
          : phase === "view" ? "내 상태"
            : boot && provider ? `${provider.company} · 본인확인` : "본인확인"
      }
      steps={inPipeline ? 2 : 0}
      step={inPipeline ? step : 0}
      stepLabels={inPipeline ? ["본인확인", "내 상태"] : null}
    />
  );

  if (phase === "auth") {
    return (
      <div className="app">
        {header}
        {boot && provider && (
          <div className="c-body" style={{ paddingBottom: 0 }}>
            <div className="confirm-co">
              <span className="cc-chk">✓</span>
              <b>{provider.company}</b>
              {provider.service && <span className="svc-tag">{provider.service}</span>}
              <span className="cc-ok">{CODE_LABEL} {provider.code}</span>
            </div>
          </div>
        )}
        <AuthFlow onVerified={onVerified} onCancel={() => router.push("/")} />
      </div>
    );
  }

  return (
    <div className="app">
      {header}

      <div className="c-body anim-in" key={phase}>
        {phase === "view" && verified && draft && (
          <>
            <div className="slabel">내 상태</div>
            <div className="stitle">{verified.name}님, 확인해 주세요</div>
            <div className="receipt" style={{ marginTop: 4 }}>
              <div className="r"><span className="k">상태</span><span className="v">{draft.trustLevel}</span></div>
              <div className="r"><span className="k">본인확인</span><span className="v">완료 · {verified.method}</span></div>
              {provider && <div className="r"><span className="k">전달 대상</span><span className="v">{provider.company}</span></div>}
              <div className="r"><span className="k">확인 시각</span><span className="v mono">{fmtDateTime(new Date())}</span></div>
            </div>
            <p className="sdesc" style={{ marginTop: 12 }}>{draft.notice}</p>
            <p className="sdesc" style={{ marginTop: 8 }}>
              확인만 하고 끝내도 됩니다. 누군가에게 보여 주고 싶을 때만 링크로 전달하세요.
            </p>
          </>
        )}

        {phase === "send" && issued && (
          <div className="done">
            <div className="big">✓</div>
            <h2>전달할 링크가 준비됐어요</h2>
            <p>
              방금 확인한 상태를 링크로 전달합니다.<br />
              캡처 대신 <b>아래 링크만</b> 카톡·문자로 보내 주세요.
              {provider && <><br /><b>{provider.company}</b> 콘솔 검증 수신에도 기록됩니다.</>}
            </p>
            <div className="share-url">{issued.shareUrl}</div>
            <button type="button" className="text-link" style={{ marginTop: 14 }} onClick={() => setPhase("view")}>
              ← 내 상태로 돌아가기
            </button>
          </div>
        )}
      </div>

      {phase === "view" && (
        <StepFooter
          prev={{
            label: busy ? "준비 중…" : "링크로 전달",
            disabled: busy || !draft,
            onClick: prepareSend,
          }}
          next={{ label: "확인 완료", onClick: () => router.push("/") }}
        />
      )}
      {phase === "send" && (
        <StepFooter
          prev={{ label: copied ? "복사됨" : "링크 복사", onClick: copyShare }}
          next={{ label: "카톡·문자로 보내기", onClick: shareNative, kind: "safe" }}
        />
      )}
    </div>
  );
}
