"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_VERTICAL, DEMO_MODE, CODE_LABEL } from "@/lib/constants";
import { DEMO_CODES } from "@/lib/demo";
import { findMemberByCode } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import AuthFlow from "@/components/AuthFlow";
import StepFooter from "@/components/StepFooter";
import FlowHeader from "@/components/FlowHeader";

const LAST_CODE_KEY = "cd_last_provider_code";

/**
 * 내 상태 보내기
 * 1) 본인확인 → 2) 내 상태 확인 → 3) 보내기
 * ?code= 또는 직전 동의 코드가 있으면 회원 콘솔 검증 수신에 귀속
 */
export default function TrustSendFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState("intro"); // intro | auth | view | send
  const [verified, setVerified] = useState(null);
  const [draft, setDraft] = useState(null);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [provider, setProvider] = useState(null); // { company, code, service? }

  const step = phase === "send" ? 4 : phase === "view" ? 3 : phase === "auth" ? 2 : 1;
  const headerLabels = ["시작", "본인확인", "내 상태", "보내기"];

  useEffect(() => {
    const q = (new URLSearchParams(window.location.search).get("code") || "").replace(/\D/g, "");
    let saved = "";
    try { saved = (sessionStorage.getItem(LAST_CODE_KEY) || "").replace(/\D/g, ""); } catch { /* */ }
    const code = q || saved;
    if (!code) return;
    findMemberByCode(code).then((m) => {
      if (!m) return;
      setProvider(m);
      try { sessionStorage.setItem(LAST_CODE_KEY, m.code || code); } catch { /* */ }
    }).catch(() => {});
  }, []);

  async function bindCode(code) {
    const m = await findMemberByCode(code);
    if (!m) { alert(`${CODE_LABEL}를 확인할 수 없습니다.`); return; }
    setProvider(m);
    try { sessionStorage.setItem(LAST_CODE_KEY, m.code || code); } catch { /* */ }
  }

  async function loadDraft(v) {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/cert/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: v.name,
          birth: v.birth,
          vertical: DEFAULT_VERTICAL,
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
    else setPhase("intro");
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
          vertical: DEFAULT_VERTICAL,
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
      title="내 상태 보내기"
      sub={
        phase === "send" ? "상대에게 보내기"
          : phase === "view" ? "내 상태 확인"
            : phase === "auth" ? "본인확인"
              : provider ? `${provider.company}에 보낼 준비`
                : "먼저 내 상태를 확인합니다"
      }
      steps={4}
      step={step}
      stepLabels={headerLabels}
    />
  );

  if (phase === "auth") {
    return (
      <div className="app">
        {header}
        <AuthFlow onVerified={onVerified} onCancel={() => setPhase("intro")} />
      </div>
    );
  }

  return (
    <div className="app">
      {header}

      <div className="c-body anim-in" key={phase}>
        {phase === "intro" && (
          <>
            {provider && (
              <div className="confirm-co">
                <span className="cc-chk">✓</span>
                <b>{provider.company}</b>
                {provider.service && <span className="svc-tag">{provider.service}</span>}
                <span className="cc-ok">{CODE_LABEL} {provider.code}</span>
              </div>
            )}
            <div className="slabel">순서</div>
            <div className="stitle">내 상태를 확인하고,<br />필요할 때 보내요</div>
            <div className="sdesc">
              1. <b>신분증·얼굴</b>로 본인확인한 뒤 <b>내 상태</b>를 봅니다.<br />
              2. 상대에게 보여 줄 때만 <b>링크로 보냅니다</b>.
            </div>
            <div className="sdesc" style={{ marginTop: 10 }}>
              이력이 없으면 <b>신규</b>입니다. 불리하게 보이지 않습니다.
              {provider && <> 링크는 <b>{provider.company}</b> 콘솔 검증 수신에도 남습니다.</>}
            </div>
            {!provider && DEMO_MODE && (
              <>
                <div className="demo-hint" style={{ marginTop: 12 }}>
                  시연 — 회원사에 귀속하려면 아래 코드를 고르세요. (없어도 직접 전달 가능)
                </div>
                <div className="demo-chips">
                  {DEMO_CODES.map((d) => (
                    <button key={d.code} type="button" className="demo-chip" onClick={() => bindCode(d.code)}>
                      {d.code} {d.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {DEMO_MODE && (
              <div className="demo-hint" style={{ marginTop: 12 }}>
                시연용 — 본인확인에서 샘플(김신규·홍길동)으로 바로 통과할 수 있어요.
              </div>
            )}
          </>
        )}

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
              이 화면을 캡처해 보내지 마세요. 보낼 때는 다음에서 <b>링크</b>로 보냅니다.
            </p>
          </>
        )}

        {phase === "send" && issued && (
          <div className="done">
            <div className="big">✓</div>
            <h2>보낼 준비가 됐어요</h2>
            <p>
              방금 확인한 상태를 링크로 보냅니다.<br />
              캡처 대신 <b>아래 링크만</b> 카톡·문자로 보내 주세요.
              {provider && <><br /><b>{provider.company}</b> 콘솔 검증 수신에도 기록됩니다.</>}
            </p>
            <div className="share-url">{issued.shareUrl}</div>
          </div>
        )}
      </div>

      {phase === "intro" && (
        <StepFooter
          prev={{ onClick: () => router.push("/") }}
          next={{ label: "내 상태 확인하기", onClick: () => setPhase("auth") }}
        />
      )}
      {phase === "view" && (
        <StepFooter
          prev={{ onClick: () => { setVerified(null); setDraft(null); setPhase("intro"); } }}
          next={{
            label: busy ? "준비 중…" : "이 내용 보내기",
            disabled: busy || !draft,
            onClick: prepareSend,
          }}
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
