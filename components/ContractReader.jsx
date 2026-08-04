"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 전자계약 — 읽고 동의 게이트
 * requireReadThrough이면 스크롤 하단(또는 짧은 문서)까지 읽어야 동의 체크 가능.
 */
export default function ContractReader({
  template,
  agreed = false,
  onAgreedChange,
  disabled = false,
}) {
  const scrollerRef = useRef(null);
  const [readThrough, setReadThrough] = useState(() => !template?.requireReadThrough);

  useEffect(() => {
    setReadThrough(!template?.requireReadThrough);
  }, [template?.id, template?.requireReadThrough]);

  useEffect(() => {
    if (!template?.requireReadThrough) return;
    const el = scrollerRef.current;
    if (!el) return;
    // 짧은 문서는 스크롤 없이 읽은 것으로 처리
    if (el.scrollHeight <= el.clientHeight + 8) {
      setReadThrough(true);
    }
  }, [template?.id, template?.sections]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el || readThrough) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) {
      setReadThrough(true);
    }
  }

  if (!template) {
    return <div className="auth-err">표시할 계약서가 없습니다.</div>;
  }

  const canCheck = readThrough && !disabled;

  return (
    <div className="contract-reader">
      <div className="panel" style={{ marginBottom: 10 }}>
        <div className="panel-head">{template.title}</div>
        <div className="receipt" style={{ margin: 0 }}>
          <div className="r"><span className="k">버전</span><span className="v mono">{template.version}</span></div>
          <div className="r"><span className="k">출처</span><span className="v">{template.source === "custom" ? "커스텀" : "업종 기본"}</span></div>
          {template.company && (
            <div className="r"><span className="k">회원사</span><span className="v">{template.company}</span></div>
          )}
        </div>
        {template.summary && <p className="sdesc" style={{ marginBottom: 0 }}>{template.summary}</p>}
      </div>

      <div
        ref={scrollerRef}
        className="contract-body"
        onScroll={onScroll}
        role="region"
        aria-label={`${template.title} 본문`}
      >
        {(template.sections || []).map((s, i) => (
          <div key={i} className="contract-sec">
            <div className="contract-sec-t">{s.t}</div>
            <div className="contract-sec-b">{s.b}</div>
          </div>
        ))}
      </div>

      {!readThrough && (
        <div className="hint" style={{ margin: "10px 0 8px" }}>
          계약서 끝까지 스크롤해 읽어 주세요. 읽은 뒤에만 동의할 수 있습니다.
        </div>
      )}
      {readThrough && template.requireReadThrough && (
        <div className="hint" style={{ margin: "10px 0 8px", color: "var(--safe)" }}>
          열람 확인됨 · 아래 동의에 체크해 주세요.
        </div>
      )}

      <label className={`cc ${agreed ? "on" : ""} ${!canCheck ? "cc-disabled" : ""}`}>
        <input
          type="checkbox"
          checked={agreed}
          disabled={!canCheck}
          onChange={(e) => onAgreedChange?.(e.target.checked)}
        />
        <span>
          위 <b>{template.title}</b> 내용을 모두 읽었으며, 전자계약 조건에 동의합니다.
        </span>
      </label>
    </div>
  );
}
