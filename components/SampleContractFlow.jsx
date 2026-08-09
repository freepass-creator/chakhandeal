"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SAMPLE_ESIGN } from "@/lib/sampleEsign";
import { fmtDateTime } from "@/lib/format";
import SignaturePad from "@/components/SignaturePad";
import StepFooter from "@/components/StepFooter";
import FlowHeader from "@/components/FlowHeader";
import ContractReader from "@/components/ContractReader";

/**
 * 폰용 전자계약 샘플 — 긴 PDF 확대가 아니라
 * 인적사항 → 차량 → 대여조건 → 보험 → 유의사항 → 약관(스크롤) → 서명
 * 각 단계 체크 후 다음.
 */
export default function SampleContractFlow() {
  const router = useRouter();
  const data = SAMPLE_ESIGN;
  const groups = data.consentGroups;

  const [phase, setPhase] = useState("intro"); // intro | group | agreement | sign | done
  const [groupIdx, setGroupIdx] = useState(0);
  const [checked, setChecked] = useState(false);
  const [agreementAgreed, setAgreementAgreed] = useState(false);
  const [sig, setSig] = useState("");
  const [doneAt, setDoneAt] = useState("");

  const stepLabels = useMemo(() => {
    return ["안내", ...groups.map((g) => g.title), "약관", "서명", "완료"];
  }, [groups]);

  const progressStep = (() => {
    if (phase === "done") return stepLabels.length;
    if (phase === "intro") return 1;
    if (phase === "group") return 2 + groupIdx;
    if (phase === "agreement") return 2 + groups.length;
    if (phase === "sign") return 2 + groups.length + 1;
    return 1;
  })();

  function onNext() {
    if (phase === "intro") {
      setPhase("group");
      setGroupIdx(0);
      setChecked(false);
      return;
    }
    if (phase === "group") {
      if (!checked) return;
      if (groupIdx + 1 < groups.length) {
        setGroupIdx((i) => i + 1);
        setChecked(false);
        return;
      }
      setPhase("agreement");
      return;
    }
    if (phase === "agreement") {
      if (!agreementAgreed) return;
      setPhase("sign");
      return;
    }
    if (phase === "sign") {
      if (!sig) return;
      setDoneAt(fmtDateTime(new Date()));
      setPhase("done");
    }
  }

  function nextLabel() {
    if (phase === "intro") return "계약 확인 시작";
    if (phase === "group") return "다음";
    if (phase === "agreement") return "다음";
    if (phase === "sign") return "서명 완료";
    return "다음";
  }

  function nextDisabled() {
    if (phase === "group") return !checked;
    if (phase === "agreement") return !agreementAgreed;
    if (phase === "sign") return !sig;
    return false;
  }

  function goBack() {
    if (phase === "done" || phase === "intro") {
      router.push("/");
      return;
    }
    if (phase === "sign") {
      setPhase("agreement");
      return;
    }
    if (phase === "agreement") {
      setPhase("group");
      setGroupIdx(groups.length - 1);
      setChecked(true);
      return;
    }
    if (phase === "group") {
      if (groupIdx > 0) {
        setGroupIdx((i) => i - 1);
        setChecked(true);
        return;
      }
      setPhase("intro");
    }
  }

  const g = groups[groupIdx];
  const screenKey = phase === "group" ? `g-${groupIdx}` : phase;

  return (
    <div className="app">
      <FlowHeader
        title="전자계약"
        sub={
          phase === "done"
            ? "샘플 서명 완료"
            : phase === "intro"
              ? "샘플 · 휴대폰 확인용"
              : phase === "group"
                ? g?.title
                : phase === "agreement"
                  ? "약관"
                  : "서명"
        }
        steps={stepLabels.length}
        step={progressStep}
        stepLabels={stepLabels}
      />

      <div
        className="c-body anim-in"
        key={screenKey}
        style={phase === "sign" || phase === "agreement" ? { display: "flex", flexDirection: "column" } : undefined}
      >
        {phase === "intro" && (
          <>
            <div className="slabel">샘플</div>
            <div className="stitle">{data.title}</div>
            <div className="sdesc">
              <b>{data.signerName}</b>님 앞으로 온 계약입니다.
              긴 계약서를 확대하지 않고, <b>내용 묶음마다 확인·동의</b>한 뒤 서명합니다.
            </div>
            <div className="alert-box" style={{ background: "var(--navy50)", border: "1px solid var(--line)" }}>
              <b>샘플 약관·샘플 데이터</b> — 법률 검토 전 문구입니다. 실제 손님 발송 전 교체합니다.
            </div>
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-title">확인 순서</div>
              <div className="receipt" style={{ margin: 0 }}>
                {groups.map((item, i) => (
                  <div className="r" key={item.key}>
                    <span className="k">{i + 1}</span>
                    <span className="v">{item.title}</span>
                  </div>
                ))}
                <div className="r"><span className="k">{groups.length + 1}</span><span className="v">약관 통독</span></div>
                <div className="r"><span className="k">{groups.length + 2}</span><span className="v">서명</span></div>
              </div>
            </div>
          </>
        )}

        {phase === "group" && g && (
          <>
            <div className="slabel">{groupIdx + 1} / {groups.length}</div>
            <div className="stitle">{g.title}</div>
            {g.note && <div className="sdesc" style={{ marginBottom: 10 }}>{g.note}</div>}
            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="receipt" style={{ margin: 0 }}>
                {g.rows.map((row) => (
                  <div className="r" key={row.label}>
                    <span className="k">{row.label}</span>
                    <span className="v">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <label className={`cc ${checked ? "on" : ""}`}>
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span>{g.confirmLabel}</span>
            </label>
          </>
        )}

        {phase === "agreement" && (
          <>
            <div className="alert-box" style={{ background: "var(--navy50)", border: "1px solid var(--line)", marginBottom: 10 }}>
              <b>샘플 약관</b> — 끝까지 스크롤한 뒤 동의할 수 있습니다.
            </div>
            <div className="slabel">약관</div>
            <div className="stitle">약관을 확인하고 동의해 주세요</div>
            <ContractReader
              template={{
                id: data.agreement.version,
                title: data.agreement.title,
                version: data.agreement.version,
                source: "custom",
                requireReadThrough: data.agreement.requireReadThrough,
                sections: data.agreement.sections,
                confirmLabel: data.agreement.confirmLabel,
              }}
              agreed={agreementAgreed}
              onAgreedChange={setAgreementAgreed}
            />
          </>
        )}

        {phase === "sign" && (
          <>
            <div className="slabel">서명</div>
            <div className="stitle">확인한 내용으로 서명해 주세요</div>
            <div className="sdesc" style={{ marginBottom: 10 }}>
              위에서 확인한 인적사항·차량·대여조건·보험·유의사항·약관에 동의하는 서명입니다.
            </div>
            <div style={{ flex: 1, minHeight: 220, display: "flex" }}>
              <SignaturePad onChange={setSig} fill />
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="done">
            <div className="big">✓</div>
            <h2>샘플 서명이 완료되었습니다</h2>
            <p>
              실제 연동에서는 이 기록이 회원사(프리패스) 진행 패널에 반영되고,
              신분증·셀카·서명·서류가 입혀진 <b>계약서 PDF</b>로 완성됩니다.
            </p>
            <div className="receipt">
              <div className="r"><span className="k">계약자</span><span className="v">{data.signerName}</span></div>
              <div className="r"><span className="k">차량</span><span className="v">12가3456 · 아반떼</span></div>
              <div className="r"><span className="k">월 대여료</span><span className="v">690,000원</span></div>
              <div className="r"><span className="k">서명일시</span><span className="v mono">{doneAt}</span></div>
              <div className="r"><span className="k">구분</span><span className="v">샘플 (저장 없음)</span></div>
            </div>
          </div>
        )}
      </div>

      {phase !== "done" && (
        <StepFooter
          prev={{ label: phase === "intro" ? "홈" : "이전", onClick: goBack }}
          next={{ label: nextLabel(), onClick: onNext, disabled: nextDisabled() }}
        />
      )}
      {phase === "done" && (
        <StepFooter
          prev={{ label: "다시 해보기", onClick: () => {
            setPhase("intro");
            setGroupIdx(0);
            setChecked(false);
            setAgreementAgreed(false);
            setSig("");
          } }}
          next={{ label: "홈으로", onClick: () => router.push("/") }}
        />
      )}
    </div>
  );
}
