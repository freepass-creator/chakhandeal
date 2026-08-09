"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_MODE } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import AuthFlow, { authProgress } from "@/components/AuthFlow";
import SignaturePad from "@/components/SignaturePad";
import StepFooter from "@/components/StepFooter";
import FlowHeader from "@/components/FlowHeader";
import ContractReader from "@/components/ContractReader";
import { VerifiedCard } from "@/components/VerifyParts";

/**
 * 프리패스 등 회원사가 발행한 계약 인스턴스 손님 여정
 * ?c={contractId} → 본인확인 → consentGroups → 서류 → 약관 → 서명
 */
export default function InstanceConsentFlow({ contractId }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [blocked, setBlocked] = useState(null);
  const [view, setView] = useState(null);

  const [started, setStarted] = useState(false);
  const [verified, setVerified] = useState(null);
  const [authLabel, setAuthLabel] = useState("방법");
  const [groupIdx, setGroupIdx] = useState(0);
  const [groupChecked, setGroupChecked] = useState(false);
  const [docIdx, setDocIdx] = useState(0);
  const [agreementAgreed, setAgreementAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [sig, setSig] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const fileRef = useRef(null);

  const groups = view?.consentGroups || [];
  const docs = view?.requiredDocs || [];
  const agreement = view?.agreement || null;

  const stepLabels = useMemo(() => {
    const labels = ["본인확인"];
    for (const g of groups) labels.push(g.title || g.key);
    if (docs.length) labels.push("서류");
    labels.push("약관", "서명", "완료");
    return labels;
  }, [groups, docs.length]);

  const screen = (() => {
    if (done) return "done";
    if (blocked) return "blocked";
    if (loading) return "loading";
    if (err && !view) return "error";
    if (!verified) return started ? "auth" : "intro";
    if (groupIdx < groups.length) return "group";
    if (docIdx < docs.length) return "doc";
    if (!signing) return "agreement";
    return "sign";
  })();

  const progressStep = (() => {
    if (done) return stepLabels.length;
    if (!verified) return 1;
    if (groupIdx < groups.length) return 2 + groupIdx;
    let idx = 2 + groups.length;
    if (docs.length) {
      if (docIdx < docs.length) return idx;
      idx += 1;
    }
    if (!signing) return idx;
    return idx + 1;
  })();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`/api/v1/contract/${encodeURIComponent(contractId)}/guest`);
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !j.ok) {
          setErr(j.error || "계약을 불러오지 못했습니다.");
          return;
        }
        setView(j.view);
        if (j.blocked) setBlocked(j.reason || "blocked");
        const consents = j.view?.consents || {};
        const gs = j.view?.consentGroups || [];
        let gi = 0;
        while (gi < gs.length && consents[gs[gi].key]) gi += 1;
        setGroupIdx(gi);
        const submitted = new Set((j.view?.documents || []).map((d) => d.key));
        const ds = j.view?.requiredDocs || [];
        let di = 0;
        while (di < ds.length && submitted.has(ds[di].key)) di += 1;
        setDocIdx(di);
        if (consents.agreement) {
          setAgreementAgreed(true);
          if (gi >= gs.length && di >= ds.length) setSigning(true);
        }
      } catch {
        if (!cancelled) setErr("계약을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contractId]);

  async function postAction(payload) {
    const r = await fetch(`/api/v1/contract/${encodeURIComponent(contractId)}/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        identityToken: verified?.identityToken || "",
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "저장 실패");
    if (j.view) setView(j.view);
    return j;
  }

  async function onVerified(v) {
    setVerified(v);
    setStarted(true);
    try {
      await fetch(`/api/v1/contract/${encodeURIComponent(contractId)}/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "identity",
          identityToken: v.identityToken || "",
          idImage: v.idImage || "",
          faceImage: v.faceImage || "",
          method: v.method || "",
        }),
      });
    } catch { /* 사진 저장 실패해도 진행 */ }
  }

  async function confirmGroup() {
    if (submitting) return;
    const g = groups[groupIdx];
    if (!g) return;
    if (!groupChecked && !DEMO_MODE) return;
    setSubmitting(true);
    setSubmitErr("");
    try {
      await postAction({ action: "consent", key: g.key });
      setGroupChecked(false);
      setGroupIdx((i) => i + 1);
    } catch (e) {
      setSubmitErr(e?.message || "저장 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function onPickDoc(file) {
    if (!file || submitting) return;
    const d = docs[docIdx];
    if (!d) return;
    setSubmitting(true);
    setSubmitErr("");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await postAction({ action: "document", key: d.key, dataUrl });
      setDocIdx((i) => i + 1);
    } catch (e) {
      setSubmitErr(e?.message || "서류 업로드 실패");
    } finally {
      setSubmitting(false);
    }
  }

  function skipOptionalDoc() {
    const d = docs[docIdx];
    if (!d || d.required) return;
    setDocIdx((i) => i + 1);
  }

  async function confirmAgreement() {
    if (submitting) return;
    if (!agreementAgreed && !DEMO_MODE) return;
    setSubmitting(true);
    setSubmitErr("");
    try {
      await postAction({ action: "consent", key: "agreement" });
      setSigning(true);
    } catch (e) {
      setSubmitErr(e?.message || "저장 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function finishSign() {
    if (submitting) return;
    if (!sig && !DEMO_MODE) return;
    setSubmitting(true);
    setSubmitErr("");
    try {
      const signature = sig || (DEMO_MODE ? tinyPngDataUrl() : "");
      await postAction({ action: "sign", signature });
      setDone(true);
    } catch (e) {
      setSubmitErr(e?.message || "서명 제출 실패");
    } finally {
      setSubmitting(false);
    }
  }

  function onNext() {
    if (!verified) return setStarted(true);
    if (groupIdx < groups.length) return confirmGroup();
    if (docIdx < docs.length) {
      const d = docs[docIdx];
      if (!d.required) return skipOptionalDoc();
      return fileRef.current?.click();
    }
    if (!signing) return confirmAgreement();
    return finishSign();
  }

  function nextLabel() {
    if (!verified) return "다음";
    if (groupIdx < groups.length) return submitting ? "저장 중…" : "다음";
    if (docIdx < docs.length) {
      const d = docs[docIdx];
      if (!d.required) return "건너뛰기";
      return submitting ? "업로드 중…" : "촬영·업로드";
    }
    if (!signing) return submitting ? "저장 중…" : "다음";
    return submitting ? "제출 중…" : "완료";
  }

  function nextDisabled() {
    if (blocked || loading) return true;
    if (!verified) return false;
    if (groupIdx < groups.length) return submitting || (!groupChecked && !DEMO_MODE);
    if (docIdx < docs.length) return submitting;
    if (!signing) return submitting || (!agreementAgreed && !DEMO_MODE);
    return submitting || (!sig && !DEMO_MODE);
  }

  function goBack() {
    if (done || blocked) { router.push("/"); return; }
    if (signing) { setSigning(false); return; }
    if (screen === "doc" && docIdx > 0) {
      setDocIdx((i) => i - 1);
      return;
    }
    if (screen === "group" && groupIdx > 0) {
      setGroupIdx((i) => i - 1);
      setGroupChecked(false);
      return;
    }
    if (verified) {
      setVerified(null);
      setStarted(false);
      setAuthLabel("방법");
      return;
    }
    router.push("/");
  }

  const header = (
    <FlowHeader
      title="전자계약"
      sub={
        blocked
          ? (blocked === "signed" ? "이미 서명 완료" : "링크 만료")
          : done
            ? "완료되었습니다"
            : screen === "auth"
              ? authLabel
              : (view?.signer?.name ? `${view.signer.name}님 계약` : "계약 확인")
      }
      steps={stepLabels.length}
      step={progressStep || 1}
      stepLabels={stepLabels}
    />
  );

  if (screen === "auth") {
    return (
      <div className="app">
        {header}
        <AuthFlow
          onVerified={onVerified}
          onCancel={() => { setStarted(false); setAuthLabel("방법"); }}
          onProgress={(p) => {
            const prog = p || authProgress("method");
            setAuthLabel(prog.label);
          }}
        />
      </div>
    );
  }

  return (
    <div className="app">
      {header}
      <div
        className="c-body anim-in"
        key={screen}
        style={screen === "sign" || screen === "agreement" ? { display: "flex", flexDirection: "column" } : undefined}
      >
        {screen === "loading" && <><div className="skel" /><div className="skel" /></>}
        {screen === "error" && <div className="auth-err">{err}</div>}

        {screen === "blocked" && (
          <div className="done">
            <div className="big">{blocked === "signed" ? "✓" : "!"}</div>
            <h2>{blocked === "signed" ? "이미 서명이 완료된 계약입니다" : "계약 링크가 만료되었습니다"}</h2>
            <p>서명 화면을 다시 열 수 없습니다. 문의는 계약 담당자에게 해 주세요.</p>
          </div>
        )}

        {screen === "intro" && view && (
          <>
            <div className="slabel">계약</div>
            <div className="stitle">{agreement?.title || "전자계약"}</div>
            <div className="sdesc">
              {view.signer?.name ? <><b>{view.signer.name}</b>님의 계약입니다. </> : null}
              본인확인 후 내용을 확인하고 서명해 주세요.
            </div>
            {agreement?.isSample && (
              <div className="alert-box" style={{ background: "var(--navy50)", border: "1px solid var(--line)" }}>
                <b>샘플 약관</b> — 법률 검토 전 문구입니다. 실계약이 아닙니다.
              </div>
            )}
          </>
        )}

        {screen === "group" && groups[groupIdx] && (
          <>
            {verified && <VerifiedCard v={verified} />}
            <div className="slabel">{groups[groupIdx].title}</div>
            <div className="stitle">{groups[groupIdx].title}을(를) 확인해 주세요</div>
            {groups[groupIdx].note && <div className="sdesc" style={{ marginBottom: 8 }}>{groups[groupIdx].note}</div>}
            <div className="panel" style={{ marginBottom: 12 }}>
              <div className="receipt" style={{ margin: 0 }}>
                {(groups[groupIdx].rows || []).map((row, i) => (
                  <div className="r" key={i}>
                    <span className="k">{row.label}</span>
                    <span className="v">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <label className={`cc ${groupChecked ? "on" : ""}`}>
              <input type="checkbox" checked={groupChecked} onChange={(e) => setGroupChecked(e.target.checked)} />
              <span>{groups[groupIdx].confirmLabel || "위 내용이 정확함을 확인합니다"}</span>
            </label>
            {submitErr && <div className="auth-err">{submitErr}</div>}
          </>
        )}

        {screen === "doc" && docs[docIdx] && (
          <>
            <div className="slabel">서류제출</div>
            <div className="stitle">{docs[docIdx].label}</div>
            {docs[docIdx].note && <div className="sdesc" style={{ marginBottom: 8 }}>{docs[docIdx].note}</div>}
            <div className="sdesc">
              {docs[docIdx].required ? "필수 서류입니다." : "선택 서류입니다. 없으면 건너뛸 수 있습니다."}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onPickDoc(f);
              }}
            />
            {submitErr && <div className="auth-err">{submitErr}</div>}
          </>
        )}

        {screen === "agreement" && agreement && (
          <>
            {agreement.isSample && (
              <div className="alert-box" style={{ background: "var(--navy50)", border: "1px solid var(--line)", marginBottom: 10 }}>
                <b>샘플 약관</b> — 법률 검토 전 문구입니다.
              </div>
            )}
            <div className="slabel">약관</div>
            <div className="stitle">약관을 읽고 동의해 주세요</div>
            <ContractReader
              template={{
                id: agreement.version || "agreement",
                title: agreement.title,
                version: agreement.version,
                source: "custom",
                requireReadThrough: !!agreement.requireReadThrough,
                sections: agreement.sections,
                confirmLabel: agreement.confirmLabel,
              }}
              agreed={agreementAgreed}
              onAgreedChange={setAgreementAgreed}
            />
            {submitErr && <div className="auth-err">{submitErr}</div>}
          </>
        )}

        {screen === "sign" && (
          <>
            <div className="slabel">서명</div>
            <div className="stitle">계약 확인을 위해 서명해 주세요</div>
            <div className="sdesc" style={{ marginBottom: 10 }}>본인이 직접 확인하는 전자서명입니다.</div>
            <div style={{ flex: 1, minHeight: 220, display: "flex" }}>
              <SignaturePad onChange={setSig} fill />
            </div>
            {submitErr && <div className="auth-err" style={{ marginTop: 12 }}>{submitErr}</div>}
          </>
        )}

        {screen === "done" && (
          <div className="done">
            <div className="big">✓</div>
            <h2>서명이 완료되었습니다</h2>
            <p>계약 기록이 회원사에 전달됩니다.</p>
            <div className="receipt">
              <div className="r"><span className="k">계약 ID</span><span className="v mono">{String(contractId).slice(0, 16)}…</span></div>
              <div className="r"><span className="k">서명일시</span><span className="v mono">{fmtDateTime(new Date())}</span></div>
              {verified?.name && <div className="r"><span className="k">서명자</span><span className="v">{verified.name}</span></div>}
            </div>
          </div>
        )}
      </div>

      {!done && !blocked && screen !== "loading" && screen !== "error" && (
        <StepFooter
          prev={{ label: "이전", onClick: goBack }}
          next={{ label: nextLabel(), onClick: onNext, disabled: nextDisabled() }}
        />
      )}
      {(done || blocked) && (
        <StepFooter next={{ label: "처음으로", onClick: () => router.push("/") }} />
      )}
    </div>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

function tinyPngDataUrl() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}
