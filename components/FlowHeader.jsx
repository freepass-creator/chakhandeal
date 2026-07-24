// 단계형/인증 화면 공용 헤더 — BI + 제목 + 연동되는 스텝바(+선택 라벨)
import BrandMark from "@/components/BrandMark";

export default function FlowHeader({ title, sub, steps = 0, step = 0, stepLabels = null }) {
  const safeStep = Math.max(0, Math.min(Number(step) || 0, Number(steps) || 0));
  const labels = Array.isArray(stepLabels) && stepLabels.length === steps ? stepLabels : null;

  return (
    <>
      <div className="c-head">
        <a href="/" className="fh-brand" style={{ display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none", color: "inherit", cursor: "pointer", marginBottom: 13 }}>
          <BrandMark size={16} className="brand-mark" />
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.3px" }}><span style={{ color: "#4fd6a8" }}>착한</span>거래</span>
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
