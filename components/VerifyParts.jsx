// 본인확인·동의·확인서 공용 UI 조각 (consent / console / me 공유)
import { fmtBirth } from "@/lib/format";
import { CONSENT_CLAUSES, CONSENT_FOOTNOTES } from "@/lib/constants";

// 본인확인 완료 카드
export function VerifiedCard({ v }) {
  return (
    <div className="verified">
      <div className="vrow"><span className="chk">✓</span> 본인확인 완료 <span style={{ fontSize: 11, color: "var(--ink3)", fontWeight: 600 }}>· {v.method}</span></div>
      <div className="info"><span><b>{v.name}</b> 님</span><span>생년월일 {fmtBirth(v.birth)}</span></div>
    </div>
  );
}

// 동의 약관(제공 항목) + 안심 각주
export function ConsentClauses() {
  return (
    <>
      <div className="clauses">
        {CONSENT_CLAUSES.map((c, i) => (
          <div className="clause" key={i}><div className="clause-t">{c.t}</div><div className="clause-b">{c.b}</div></div>
        ))}
      </div>
      <ul className="footnotes">{CONSENT_FOOTNOTES.map((f, i) => <li key={i}>{f}</li>)}</ul>
    </>
  );
}

// 동의 결과 뱃지 (cert: { unresolved, count }) — full=상세 문구 · 「이상 없음」대신 신규/이력 표현
export function CertBadge({ cert, full = false }) {
  return cert?.unresolved
    ? <span className="badge b-red"><span className="dot" />미해소{full ? " 거래이력" : ""} {cert.count}건</span>
    : <span className="badge b-green"><span className="dot" />{full ? "신규 · 미해소 이력 없음" : "신규"}</span>;
}
