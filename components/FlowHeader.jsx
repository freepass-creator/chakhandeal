// 단계형/인증 화면 공용 헤더 — BI + 제목 + 연동되는 스텝바(+선택 라벨)
import BrandMark from "@/components/BrandMark";

/**
 * @param brand   상단에 지속 표시할 서비스 브랜드. 축소형 기본값은 착한거래다.
 * @param compact 브랜드와 현재 페이지 소개를 작은 2단 헤더로 표시한다.
 */
export default function FlowHeader({ title, sub, steps = 0, step = 0, stepLabels = null, brand = "", compact = false }) {
  const safeStep = Math.max(0, Math.min(Number(step) || 0, Number(steps) || 0));
  const labels = Array.isArray(stepLabels) && stepLabels.length === steps ? stepLabels : null;

  // 계약 화면 — 브랜드와 현재 단계를 짧게 유지해 본문 공간을 과도하게 차지하지 않는다.
  if (compact) {
    return (
      <>
        {/*
          상단바는 «어디에 있는지»만 알려주고 물러선다.
          본문과 같은 검정·같은 크기로 두면 계약 내용과 경쟁해서 읽기를 방해한다.
          → 제목은 네이비로 낮추고, 크기·굵기도 본문 제목보다 작게.
        */}
        {/*
          상단바는 «무엇을 하는 화면인지»와 «어디쯤인지»만 말하고 물러선다.
          임대인·차량·계약번호는 첫 화면의 «계약 요지» 카드가 이미 보여준다 —
          헤더가 같은 것을 또 말하면 본문 자리를 먹고 읽기를 방해한다.
        */}
        <div className="c-head" style={{ paddingTop: "calc(10px + var(--sat))", paddingBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            {/* 계약 당사자는 본문에서 분명히 밝히고, 상단에는 서비스 제공 브랜드를 일관되게 표시한다. */}
            <a
              href="/"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#fff", textDecoration: "none" }}
              aria-label="착한거래 홈"
            >
              <BrandMark size={14} className="brand-mark" />
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-.3px" }}>
                {brand || "착한거래"}
              </span>
            </a>
            {steps > 0 && (
              <span style={{ flex: "none", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.72)", fontVariantNumeric: "tabular-nums" }}>
                {safeStep} / {steps}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 7, minWidth: 0 }}>
            <span style={{ color: "#fff", fontSize: 15, fontWeight: 800, letterSpacing: "-.35px", flex: "none" }}>
              {title || "전자계약"}
            </span>
            {sub && (
              <span style={{ color: "rgba(255,255,255,.72)", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sub}
              </span>
            )}
          </div>
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
