"use client";

import { useRef, useEffect } from "react";
import { DEMO_MODE } from "@/lib/constants";

// 손가락/마우스 서명 캔버스. onChange(dataURL|"") 로 결과 전달.
export default function SignaturePad({ onChange, fill }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#16314d";
    ctxRef.current = ctx;
  }, []);

  function pos(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  function start(e) { e.preventDefault(); drawing.current = true; const { x, y } = pos(e); ctxRef.current.beginPath(); ctxRef.current.moveTo(x, y); }
  function move(e) { if (!drawing.current) return; e.preventDefault(); const { x, y } = pos(e); ctxRef.current.lineTo(x, y); ctxRef.current.stroke(); dirty.current = true; }
  function end() { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange?.(canvasRef.current.toDataURL("image/png")); }
  function clear() {
    const c = canvasRef.current;
    ctxRef.current.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange?.("");
  }
  function sampleSign() {
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    clear();
    const w = c.getBoundingClientRect().width;
    const h = c.getBoundingClientRect().height;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, h * 0.55);
    ctx.bezierCurveTo(w * 0.3, h * 0.2, w * 0.45, h * 0.8, w * 0.6, h * 0.4);
    ctx.bezierCurveTo(w * 0.7, h * 0.25, w * 0.8, h * 0.5, w * 0.88, h * 0.45);
    ctx.stroke();
    dirty.current = true;
    onChange?.(c.toDataURL("image/png"));
  }

  return (
    <div className="sig" style={fill ? { display: "flex", flexDirection: "column", height: "100%", width: "100%", marginTop: 0 } : undefined}>
      <canvas
        ref={canvasRef}
        className="sig-canvas"
        style={fill ? { flex: 1, minHeight: 0, height: "auto" } : undefined}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div className="sig-bar">
        <span className="sig-hint">위 칸에 손가락으로 서명해 주세요</span>
        {DEMO_MODE && <button type="button" className="btn btn-sm" onClick={sampleSign}>샘플 서명</button>}
        <button type="button" className="btn btn-sm" onClick={clear}>지우기</button>
      </div>
    </div>
  );
}
