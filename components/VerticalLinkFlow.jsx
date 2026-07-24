"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_PROVIDER_CODES, DEFAULT_VERTICAL, getVertical } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import AuthFlow from "@/components/AuthFlow";
import StepFooter from "@/components/StepFooter";
import FlowHeader from "@/components/FlowHeader";
import SignaturePad from "@/components/SignaturePad";

/**
 * 공통 검증 링크 플로우 (pet / rent 등)
 * 1차 본인확인·동의 → 2차 링크 생성 → 카톡·문자로 URL만 전달
 */
export default function VerticalLinkFlow({ verticalId }) {
  const demosAll = DEMO_PROVIDER_CODES;
  const router = useRouter();
  const [vid, setVid] = useState(verticalId || DEFAULT_VERTICAL);
  const V = getVertical(vid);
  const [code, setCode] = useState("");
  const [provider, setProvider] = useState(null);
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [started, setStarted] = useState(false);
  const [verified, setVerified] = useState(null);
  const [agreed, setAgreed] = useState({ base: false, share: false, extra: false });
  const [draft, setDraft] = useState(null);
  const [signing, setSigning] = useState(false);
  const [sig, setSig] = useState("");
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const c = (new URLSearchParams(window.location.search).get("code") || "").replace(/\D/g, "");
    if (!c) return;
    setCode(c);
    lookup(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookup(c) {
    const raw = (c || code).replace(/\D/g, "");
    setErr("");
    setChecking(true);
    try {
      const r = await fetch(`/api/v1/member/by-code?code=${encodeURIComponent(raw)}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok && j.member) {
        if (j.member.vertical) setVid(j.member.vertical);
        setProvider(j.member);
        return;
      }
      for (const [id, list] of Object.entries(demosAll)) {
        const demo = list.find((d) => d.code === raw);
        if (demo) {
          setVid(id);
          setProvider({ ...demo, vertical: id });
          return;
        }
      }
      setErr("코드를 확인할 수 없습니다.");
      setProvider(null);
    } catch {
      setErr("확인 중 오류가 발생했습니다.");
    } finally {
      setChecking(false);
    }
  }

  async function loadDraft(v) {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/cert/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: v.name, birth: v.birth, vertical: V.id, method: v.method }),
      });
      const j = await r.json();
      if (j.ok) setDraft(j.draft);
      else alert(j.error || "검증 준비 실패");
    } finally {
      setBusy(false);
    }
  }

  async function onVerified(v) {
    setVerified(v);
    await loadDraft(v);
  }

  function buildShare(id, company) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const base = V.verifyPath || "/v";
    const shareUrl = `${origin}${base}?id=${encodeURIComponent(id)}`;
    const shareText = [
      `[착한거래] ${company} ${V.sharePurpose} 상태 링크입니다.`,
      ``,
      shareUrl,
      ``,
      `※ 캡처·복사본이 아니라 위 링크를 열어 확인해 주세요.`,
    ].join("\n");
    return { shareUrl, shareText };
  }

  async function issue() {
    if (!sig) { alert("서명을 해 주세요."); return; }
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
          vertical: V.id,
          providerCode: provider.code,
          signed: true,
        }),
      });
      const j = await r.json();
      if (!j.ok) { alert(j.error || "링크 생성 실패"); return; }
      setIssued({ ...j, ...buildShare(j.id, provider.company) });
    } finally {
      setBusy(false);
    }
  }

  async function copyShare() {
    if (!issued?.shareUrl) return;
    try {
      await navigator.clipboard?.writeText(issued.shareUrl);
      setCopied("copied");
      setTimeout(() => setCopied(""), 2000);
    } catch {
      alert("복사에 실패했습니다. 아래 링크를 길게 눌러 복사해 주세요.");
    }
  }

  async function shareNative() {
    if (!issued) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${provider.company} 상태 링크`,
          text: `[착한거래] ${provider.company} ${V.sharePurpose} 상태 링크입니다. 캡처가 아니라 링크를 열어 확인해 주세요.`,
          url: issued.shareUrl,
        });
        return;
      } catch { /* fall through */ }
    }
    copyShare();
  }

  // 단일 파이프라인 — AuthFlow는 '본인확인'(2) 안
  const step = issued || signing ? 4 : verified ? 3 : (started || provider) ? 2 : 1;
  const allAgree = agreed.base && agreed.share && agreed.extra;
  const headerLabels = ["대상", "본인확인", "확인", "보내기"];

  if (started && !verified) {
    return (
      <div className="app">
        <FlowHeader
          title="내 상태 보내기"
          sub={provider ? `${provider.company} 안내용` : "본인확인"}
          steps={4}
          step={step}
          stepLabels={headerLabels}
        />
        <AuthFlow onVerified={onVerified} onCancel={() => setStarted(false)} />
      </div>
    );
  }

  return (
    <div className="app">
      <FlowHeader
        title="내 상태 보내기"
        sub={provider ? `${provider.company}에 보낼 상태 링크` : "요청자 코드를 입력해 시작하세요"}
        steps={4}
        step={step}
        stepLabels={headerLabels}
      />

      <div className="c-body anim-in" key={issued ? "done" : signing ? "sign" : draft ? "draft" : "intro"}>
        {!provider && (
          <>
            <div className="slabel">요청자 확인</div>
            <div className="stitle">누구에게 보낼까요?</div>
            <div className="sdesc">
              요청자 코드를 입력하세요. 상태 링크를 만든 뒤 <b>카톡·문자로 URL만</b> 보내면 됩니다.
            </div>
            <div className="field">
              <label>요청자 코드</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={4}
                placeholder="예: 1001"
              />
            </div>
            {err && <div className="auth-err">{err}</div>}
            <div className="demo-hint">시연 — 렌탈 <b>1001</b> · 반려 분양 <b>2001</b></div>
          </>
        )}

        {provider && !started && !verified && (
          <>
            <div className="confirm-co"><span className="cc-chk">✓</span> <b>{provider.company}</b> <span className="cc-ok">확인됨</span></div>
            <div className="slabel">{V.campaignTitle}</div>
            <div className="stitle">{V.oneLiner}</div>
            <div className="sdesc">
              본인확인 후 <b>상태 링크</b>를 만들면 <b>{provider.company}</b>에 귀속되고,
              카톡·문자로는 <b>URL만</b> 보내면 됩니다.
            </div>
            <div className="sdesc" style={{ marginTop: 8 }}>
              처음이어도 됩니다. 이력이 없으면 <b>신규</b>로 표시되며 불리하게 보이지 않습니다.
            </div>
          </>
        )}

        {verified && draft && !signing && !issued && (
          <>
            <div className="slabel">내용 확인</div>
            <div className="stitle">링크에 담길 내용을 확인해 주세요</div>
            <div className="sdesc">확인·서명 후 <b>상태 링크</b>가 만들어집니다. 상대에게는 이 화면이 아니라 <b>URL만</b> 보내 주세요.</div>

            <div className="panel">
              <div className="panel-head">{draft.certName}</div>
              <div className="receipt" style={{ margin: 0 }}>
                <div className="r"><span className="k">본인확인</span><span className="v">완료 · {verified.method}</span></div>
                <div className="r"><span className="k">상태</span><span className="v">{draft.trustLevel}</span></div>
                <div className="r"><span className="k">확인된 이력</span><span className="v">{draft.summary.confirmedAdoptionsOrDeals}건</span></div>
                <div className="r"><span className="k">중대 위반(확정)</span><span className="v">{draft.summary.seriousBreaches}건</span></div>
                <div className="r"><span className="k">링크 유효</span><span className="v mono">{fmtDateTime(draft.expiresAt)}</span></div>
              </div>
              <p className="sdesc">{draft.notice}</p>
            </div>

            <label className={`cc ${agreed.base ? "on" : ""}`}>
              <input type="checkbox" checked={agreed.base} onChange={(e) => setAgreed((s) => ({ ...s, base: e.target.checked }))} />
              <span>본인확인·상태 링크 생성을 위한 필수 정보 처리에 동의합니다.</span>
            </label>
            <label className={`cc ${agreed.share ? "on" : ""}`}>
              <input type="checkbox" checked={agreed.share} onChange={(e) => setAgreed((s) => ({ ...s, share: e.target.checked }))} />
              <span><b>{provider.company}</b>에게 이번 건에 한해 상태 링크를 전달(카톡·문자 등)하는 데 동의합니다.</span>
            </label>
            <label className={`cc ${agreed.extra ? "on" : ""}`}>
              <input type="checkbox" checked={agreed.extra} onChange={(e) => setAgreed((s) => ({ ...s, extra: e.target.checked }))} />
              <span>{V.extraAgree}</span>
            </label>
          </>
        )}

        {signing && !issued && (
          <>
            <div className="slabel">서명</div>
            <div className="stitle">{V.signTitle}</div>
            <div className="sdesc" style={{ marginBottom: 10 }}>서명 후 상태 링크가 만들어집니다. 이어서 카톡·문자로 <b>URL만</b> 보내 주세요.</div>
            <div style={{ flex: 1, minHeight: 220, display: "flex" }}>
              <SignaturePad onChange={setSig} fill />
            </div>
          </>
        )}

        {issued && (
          <div className="done">
            <div className="big">✓</div>
            <h2>상태 링크가 준비되었습니다</h2>
            <p>
              <b>{provider.company}</b> 로그인 콘솔에도 보입니다.<br />
              아래 <b>링크만</b> 카톡·문자로 보내 주세요. 캡처·복사본은 위조될 수 있어 받지 않습니다.
            </p>
            <div className="share-url">{issued.shareUrl}</div>
          </div>
        )}
      </div>

      {!issued && (
        <StepFooter
          prev={{
            onClick: () => {
              if (signing) { setSigning(false); return; }
              if (verified) { setVerified(null); setDraft(null); setStarted(false); return; }
              if (provider) { setProvider(null); setCode(""); return; }
              router.push("/");
            },
          }}
          next={{
            label: !provider ? (checking ? "확인 중…" : "다음")
              : !started && !verified ? "본인확인"
              : verified && !signing ? "서명하기"
              : busy ? "만드는 중…" : "상태 링크 만들기",
            disabled: !provider ? checking || !code.trim()
              : verified && !signing ? !allAgree || !draft
              : signing ? !sig || busy
              : false,
            onClick: () => {
              if (!provider) return lookup(code);
              if (!started && !verified) return setStarted(true);
              if (verified && !signing) return setSigning(true);
              if (signing) return issue();
            },
          }}
        />
      )}
      {issued && (
        <StepFooter
          prev={{ label: copied === "copied" ? "복사됨" : "링크 복사", onClick: copyShare }}
          next={{ label: "카톡·문자로 보내기", onClick: shareNative, kind: "safe" }}
        />
      )}
    </div>
  );
}
