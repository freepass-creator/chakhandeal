// 단계형 화면 하단 내비게이션 — [이전] [다음] 규격 통일.
// prev/next = { label?, onClick, disabled?, kind? } | null
//  - 둘 다 주면 [이전][다음](다음이 넓게), 하나만 주면 전체폭 1개.
import { tap } from "@/lib/haptic";

export default function StepFooter({ prev, next }) {
  if (prev && next) {
    return (
      <div className="c-footer wiz">
        <button className="btn btn-prev" onClick={tap(prev.onClick)} disabled={prev.disabled}>{prev.label || "이전"}</button>
        <button className={`btn btn-${next.kind || "safe"} btn-next`} onClick={tap(next.onClick)} disabled={next.disabled}>{next.label || "다음"}</button>
      </div>
    );
  }
  const only = next || prev;
  if (!only) return null;
  return (
    <div className="c-footer">
      <button className={`btn ${next ? `btn-${next.kind || "safe"}` : ""} btn-block`} onClick={tap(only.onClick)} disabled={only.disabled}>{only.label || (next ? "다음" : "이전")}</button>
    </div>
  );
}
