"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { findMemberByCode, createSelfConsent } from "@/lib/db";
import { CONSENT_NOTICES, CONSENT_VERSION, CAMPAIGN_TITLE, CAMPAIGN_HEADLINE, CAMPAIGN_LEAD, CODE_LABEL, DEMO_MODE, RISK_TYPES } from "@/lib/constants";
import { DEMO_CODES } from "@/lib/demo";
import { fmtDateTime } from "@/lib/format";
import AuthFlow from "@/components/AuthFlow";
import NoticeList from "@/components/NoticeList";
import SignaturePad from "@/components/SignaturePad";
import StepFooter from "@/components/StepFooter";
import FlowHeader from "@/components/FlowHeader";
import { VerifiedCard, ConsentClauses, CertBadge } from "@/components/VerifyParts";

export default function SelfConsentPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [target, setTarget] = useState(null);   // { company, code }
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const [started, setStarted] = useState(false);
  const [verified, setVerified] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [sig, setSig] = useState("");
  const [done, setDone] = useState(false);
  const [receipt, setReceipt] = useState(null);

  // 회원이 보낸 링크(/consent?code=...)로 들어오면 거래코드 자동 입력·확인
  useEffect(() => {
    const c = (new URLSearchParams(window.location.search).get("code") || "").replace(/\D/g, "");
    if (!c) return;
    setCode(c);
    findMemberByCode(c).then((m) => { if (m) setTarget(m); }).catch(() => {});
  }, []);

  async function lookup() {
    setErr("");
    const c = code.trim();
    if (!c) { setErr(`${CODE_LABEL}를 입력해 주세요.`); return; }
    setChecking(true);
    try {
      const m = await findMemberByCode(c);
      if (!m) { setErr(`‘${c}’ ${CODE_LABEL}의 거래 상대를 찾을 수 없습니다. 아직 착한거래 회원이 아니라면 동의를 진행할 수 없어요.`); return; }
      setTarget(m);
    } catch (e) {
      console.error(e);
      setErr("확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setChecking(false);
    }
  }

  // 하단 [다음] 버튼 — 현재 단계에 따라 동작/문구/비활성 결정
  function onNext() {
    if (!target) return lookup();
    if (!started && !verified) return setStarted(true);
    if (verified && !signing) return setSigning(true);
    if (verified && signing) return finish();
  }
  function nextLabel() {
    if (!target) return checking ? "확인 중…" : "다음";
    if (!started && !verified) return "본인확인";
    if (verified && signing) return "완료";
    if (verified && !signing) return "서명하기";
    return "다음";
  }
  function nextDisabled() {
    if (!target) return checking || !code.trim();
    if (verified && !signing) return !agreed;
    if (verified && signing) return !sig;
    return false;
  }

  async function finish() {
    // 동의 기록·사진 업로드는 서버(/api/v1/consent)에서 처리 — 클라이언트 위조·Firestore 직접쓰기 방지
    try {
      const res = await createSelfConsent({
        name: verified.name,
        phone: verified.phone,
        company: target.company,
        code: target.code,
        verified: { name: verified.name, birth: verified.birth, method: verified.method },
        signed: !!sig,
        idImage: verified.idImage || "",
        faceImage: verified.faceImage || "",
      });
      const cert = res.cert || { unresolved: false, count: 0, types: [] };
      const id = res.id || "-";
      setReceipt({ cid: String(id).slice(-8).toUpperCase(), ts: fmtDateTime(new Date()), cert });
    } catch (e) {
      console.error(e);
      setReceipt({ cid: "-", ts: fmtDateTime(new Date()), cert: { unresolved: false, count: 0, types: [] } });
    }
    setDone(true);
  }

  // 단일 파이프라인 — AuthFlow는 '본인확인'(2) 안의 세부 단계일 뿐, 진행바를 갈아끼우지 않음
  const step = done || signing ? 4 : verified ? 3 : (started || target) ? 2 : 1;
  const screen = done ? "done" : signing ? "sign" : verified ? "agree" : target ? "intro" : "code";
  const headerLabels = ["대상", "본인확인", "동의", "서명"];

  function goBack() {
    if (done) { router.push("/"); return; }
    if (signing) { setSigning(false); return; }
    if (verified) { setVerified(null); setAgreed(false); return; }
    if (started) { setStarted(false); return; }
    if (target) { setTarget(null); setCode(""); setErr(""); return; }
    router.push("/");
  }

  return (
    <div className="app">
      <FlowHeader
        title="이번 거래에 동의"
        sub={started && !verified ? "본인확인" : target ? `${target.company}와의 거래` : `${CODE_LABEL}를 입력해 시작하세요`}
        steps={4}
        step={step}
        stepLabels={headerLabels}
      />

      {started && !verified ? (
        <AuthFlow onVerified={setVerified} onCancel={() => setStarted(false)} />
      ) : (
        <>
      <div className="c-body anim-in" key={screen} style={screen === "sign" ? { display: "flex", flexDirection: "column" } : undefined}>
        {/* STEP 0 — 업체코드 입력 */}
        {!target && (
          <>
            <div className="slabel">동의 대상 확인</div>
            <div className="stitle">어느 거래에 동의하시나요?</div>
            <div className="sdesc">거래 상대로부터 받은 <b>{CODE_LABEL}</b>를 입력해 주세요. 착한거래에 등록된 회원만 동의 대상이 될 수 있습니다.</div>
            <form onSubmit={(e) => { e.preventDefault(); lookup(); }}>
              <div className="field"><label>{CODE_LABEL}</label>
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={4} placeholder="예: 1234" style={{ letterSpacing: 2 }} /></div>
              {err && <div className="auth-err">{err}</div>}
            </form>
            {DEMO_MODE && (
              <div className="demo-chips">
                {DEMO_CODES.map((d) => (
                  <button
                    key={d.code}
                    type="button"
                    className="demo-chip"
                    onClick={() => { setCode(d.code); setErr(""); findMemberByCode(d.code).then((m) => { if (m) setTarget(m); }).catch(() => {}); }}
                  >
                    {d.code} {d.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* STEP 1 — 캠페인 안내 + 본인인증 */}
        {target && !started && !verified && (
          <>
            <div className="confirm-co"><span className="cc-chk">✓</span> <b>{target.company}</b>{target.service && <span className="svc-tag">{target.service} 서비스</span>} <span className="cc-ok">확인됨</span></div>
            <div className="slabel">{CAMPAIGN_TITLE}</div>
            <div className="stitle">{CAMPAIGN_HEADLINE}</div>
            <div className="sdesc">{CAMPAIGN_LEAD}</div>
            <NoticeList items={CONSENT_NOTICES} />
          </>
        )}
        {/* STEP 2 — 동의 */}
        {verified && !signing && !done && (
          <>
            <VerifiedCard v={verified} />
            <div className="slabel">동의 · {target.company}</div>
            <div className="stitle">아래 내용에 동의해 주세요</div>
            <div className="sdesc" style={{ marginBottom: 8 }}>동의하면 동의 기록이 <b>{target.company}</b> 콘솔에 <b>함께 남습니다</b>. (캡처·확인서 복사본은 만들지 않습니다.)</div>
            <ConsentClauses />
            <label className={`cc ${agreed ? "on" : ""}`}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> <span>위 내용을 확인하였으며, 이번 건 동의 기록이 <b>{target.company}</b> 콘솔에 남는 데 동의합니다.</span>
            </label>
          </>
        )}

        {/* STEP 3 — 서명 */}
        {verified && signing && !done && (
          <>
            <div className="slabel">서명</div>
            <div className="stitle">동의 확인을 위해 서명해 주세요</div>
            <div className="sdesc" style={{ marginBottom: 10 }}>{target.company}와의 거래 동의를 본인이 직접 확인하는 전자서명입니다.</div>
            <div style={{ flex: 1, minHeight: 220, display: "flex" }}>
              <SignaturePad onChange={setSig} fill />
            </div>
          </>
        )}

        {/* STEP 4 — 완료 */}
        {done && verified && receipt && (
          <div className="done">
            <div className="big">✓</div>
            <h2>동의가 완료되었습니다</h2>
            <p><b>{target.company}</b>에 착한거래 동의 기록이<br />함께 제출되었습니다.</p>
            <div className="panel">
              <div className="panel-title">동의 결과 · {verified.name}</div>
              <CertBadge cert={receipt.cert} full />
              {receipt.cert?.unresolved && receipt.cert.types?.length > 0 && (
                <div className="sdesc">{receipt.cert.types.map((t) => RISK_TYPES[t] || t).join(" · ")}</div>
              )}
            </div>
            <div className="receipt">
              <div className="r"><span className="k">동의번호</span><span className="v mono">{receipt.cid}</span></div>
              <div className="r"><span className="k">대상 회원사</span><span className="v">{target.company}</span></div>
              <div className="r"><span className="k">본인확인</span><span className="v">완료 · {verified.method}</span></div>
              <div className="r"><span className="k">동의자</span><span className="v">{verified.name}</span></div>
              <div className="r"><span className="k">전자서명</span><span className="v">{sig ? "완료" : "—"}</span></div>
              <div className="r"><span className="k">동의일시</span><span className="v mono">{receipt.ts}</span></div>
              <div className="r"><span className="k">문구버전</span><span className="v">{CONSENT_VERSION}</span></div>
            </div>
            <div className="hint">
              {target.company} 콘솔에 동의 기록이 남았습니다.<br />
              상대에게 상태를 보여 줘야 하면 <b>내 상태 보내기</b>로 이어서 링크를 만드세요.
            </div>
          </div>
        )}
      </div>
      {!done && <StepFooter prev={{ onClick: goBack }} next={{ label: nextLabel(), onClick: onNext, disabled: nextDisabled() }} />}
      {done && (
        <StepFooter
          prev={{ label: "처음으로", onClick: () => router.push("/") }}
          next={{
            label: "내 상태 보내기",
            onClick: () => {
              try { sessionStorage.setItem("cd_last_provider_code", target.code); } catch { /* */ }
              router.push(`/go?code=${encodeURIComponent(target.code)}`);
            },
            kind: "safe",
          }}
        />
      )}        </>
      )}
    </div>
  );
}
