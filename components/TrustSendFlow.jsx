"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_VERTICAL, CODE_LABEL } from "@/lib/constants";
import { findMemberByCode } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import AuthFlow, { authProgress } from "@/components/AuthFlow";
import StepFooter from "@/components/StepFooter";
import FlowHeader from "@/components/FlowHeader";

/**
 * 내 상태 보기
 * - 본인확인 중: AuthFlow 실제 단계 표시
 * - 확인 후: 페이지에 복사/전달, 하단바는 처음으로
 */
export default function TrustSendFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState("auth"); // auth | view
  const [verified, setVerified] = useState(null);
  const [draft, setDraft] = useState(null);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [provider, setProvider] = useState(null);
  const [boot, setBoot] = useState(false);
  const [authStep, setAuthStep] = useState(1);
  const [authLabel, setAuthLabel] = useState("방법");

  const vertical = provider?.vertical || DEFAULT_VERTICAL;
  const AUTH_LABELS = ["방법", "인증", "확인", "완료"];

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
      return false;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onVerified(v) {
    setVerified(v);
    const ok = await loadDraft(v);
    if (!ok) {
      setDraft({
        trustLevel: "신규",
        notice: "이력이 없으면 신규·본인확인 완료로 표시됩니다. 불리한 의미가 아닙니다.",
        identityVerified: true,
      });
    }
    setPhase("view");
  }

  function buildShare(id) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return { shareUrl: `${origin}/v?id=${encodeURIComponent(id)}` };
  }

  async function ensureLink() {
    if (issued?.shareUrl) return issued;
    if (!verified || !draft) return null;
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
      if (!j.ok) { alert(j.error || "링크 준비에 실패했습니다."); return null; }
      const next = { ...j, ...buildShare(j.id) };
      setIssued(next);
      return next;
    } finally {
      setBusy(false);
    }
  }

  async function copyShare() {
    const link = await ensureLink();
    if (!link?.shareUrl) return;
    try {
      await navigator.clipboard?.writeText(link.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("복사에 실패했습니다. 아래 링크를 길게 눌러 복사해 주세요.");
    }
  }

  async function shareNative() {
    const link = await ensureLink();
    if (!link?.shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "착한거래 상태 링크",
          text: "캡처가 아니라 링크를 열어 확인해 주세요.",
          url: link.shareUrl,
        });
        return;
      } catch { /* fall through */ }
    }
    try {
      await navigator.clipboard?.writeText(link.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("아래 링크를 길게 눌러 복사해 주세요.");
    }
  }

  const header = (
    <FlowHeader
      title="내 상태 보기"
      sub={
        phase === "view" ? "내 상태"
          : boot && provider ? `${provider.company} · ${authLabel}` : authLabel
      }
      steps={phase === "auth" ? 4 : 0}
      step={phase === "auth" ? authStep : 0}
      stepLabels={phase === "auth" ? AUTH_LABELS : null}
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
        <AuthFlow
          onVerified={onVerified}
          onCancel={() => router.push("/")}
          onProgress={(p) => {
            const prog = p || authProgress("method");
            setAuthStep(prog.step);
            setAuthLabel(prog.label);
          }}
        />
      </div>
    );
  }

  return (
    <div className="app">
      {header}

      <div className="c-body anim-in">
        {verified && draft && (
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

            <div className="share-box" style={{ marginTop: 18 }}>
              <div className="sdesc" style={{ marginBottom: 10 }}>
                보여 줄 상대가 있으면 링크로 전달하세요. 캡처는 인정되지 않습니다.
                {provider && <> <b>{provider.company}</b> 콘솔에도 기록됩니다.</>}
              </div>
              {issued?.shareUrl && <div className="share-url">{issued.shareUrl}</div>}
              <div className="share-actions" style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1 }}
                  disabled={busy || !draft}
                  onClick={copyShare}
                >
                  {busy ? "준비 중…" : copied ? "복사됨" : "복사하기"}
                </button>
                <button
                  type="button"
                  className="btn btn-safe"
                  style={{ flex: 1 }}
                  disabled={busy || !draft}
                  onClick={shareNative}
                >
                  {busy ? "준비 중…" : "전달하기"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <StepFooter next={{ label: "처음으로", onClick: () => router.push("/") }} />
    </div>
  );
}
