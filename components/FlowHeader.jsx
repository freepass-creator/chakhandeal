// 단계형/인증 화면 공용 헤더 — BI + 제목 + 연동되는 스텝바(+선택 라벨)
import BrandMark from "@/components/BrandMark";

/**
 * @param brand   회원사 이름. 주면 착한거래 BI 대신 이것을 세운다 —
 *                손님은 «자기가 거래하는 회사»와 계약한다고 알기 때문이다.
 * @param compact 헤더를 한 줄로 눌러 본문에 자리를 내준다(전자계약 손님 화면).
 */
export default function FlowHeader({ title, sub, steps = 0, step = 0, stepLabels = null, brand = "", compact = false }) {
  const safeStep = Math.max(0, Math.min(Number(step) || 0, Number(steps) || 0));
  const labels = Array.isArray(stepLabels) && stepLabels.length === steps ? stepLabels : null;

  // 계약 화면 — 회사명·문서명·차량을 «한 줄»로. 큰 로고와 h1 이 화면을 먹지 않게.
  if (compact) {
    return (
      <>
        <div className="c-head" style={{ paddingTop: 12, paddingBottom: 8 }}>
          {/* 회사명 왼쪽 · 진행 오른쪽 — 한 줄에 붙여 세로 공간을 아낀다 */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            {brand
              ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink3)", letterSpacing: "-.2px" }}>{brand}</span>
              : <span />}
            {steps > 0 && (
              <span style={{ flex: "none", fontSize: 11, fontWeight: 700, color: "var(--ink3)", fontVariantNumeric: "tabular-nums" }}>
                {safeStep} / {steps}
              </span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.4px", marginTop: 2 }}>
            {title}
          </div>
          {sub && <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 3 }}>{sub}</div>}
        </div>
        {/*
          점만 남긴다. 단계 이름을 여기 붙이면 좁은 폭에서 잘려 읽히지 않는다 —
          지금 어느 단계인지는 본문 제목이 말한다(「계약 내용을 확인해 주세요」 등).
          여기는 «몇 개 중 몇 번째»만 알려주는 내비게이션이다.
        */}
        {steps > 0 && (
          <div className="steps" style={{ paddingBottom: 10 }}>
            {Array.from({ length: steps }).map((_, i) => {
              const n = i + 1;
              return (
                <div key={i} className="s-wrap">
                  <div className={`s ${safeStep >= n ? "on" : ""} ${safeStep === n ? "cur" : ""}`} />
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="c-head">
        <a href="/" className="fh-brand" style={{ display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none", color: "inherit", cursor: "pointer", marginBottom: 13 }}>
          <BrandMark size={16} className="brand-mark" />
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.3px" }}><span style={{ color: "var(--safe)" }}>착한</span>거래</span>
        </a>
        <h1>{title}</h1>
        {sub && <div className="co">{sub}</div>}
      </div>
      {steps > 0 && (
        <div className={`steps${labels ? " has-labels" : ""}`}>
          {Array.from({ length: steps }).map((_, i) => {
            const n = i + 1;
            const on = safeStep >= n;
            const cur = safeStep === n;
            return (
              <div key={i} className={`s-wrap`}>
                <div className={`s ${on ? "on" : ""} ${cur ? "cur" : ""}`} />
                {labels && (
                  <span className={`s-label ${on ? "on" : ""} ${cur ? "cur" : ""}`}>{labels[i]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
