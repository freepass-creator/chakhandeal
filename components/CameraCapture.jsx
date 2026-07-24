"use client";

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";

// 라이브 카메라 — 저장사진 업로드 불가, 그 자리 촬영만. 부모 영역을 가득 채움(스크롤 없이).
// 촬영/재촬영은 부모(하단 고정 버튼)가 ref로 호출: ref.current.capture() / .retake()
// 가운데 가이드 틀(신분증=가로 3:2, 셀카=세로 3:4)에 맞춰 그 영역만 캡처.
const CameraCapture = forwardRef(function CameraCapture({ facing = "environment", max = 1100, onCapture, guide }, ref) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [err, setErr] = useState("");
  const [shot, setShot] = useState("");
  const isUser = facing === "user";
  const targetAR = isUser ? 3 / 4 : 3 / 2;

  useEffect(() => {
    let cancelled = false;
    function stop() { if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; } }
    async function start() {
      setErr("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      } catch { setErr("카메라를 열 수 없습니다. 브라우저에서 카메라 권한을 허용한 뒤 다시 시도해 주세요."); }
    }
    if (!shot) start();
    return () => { cancelled = true; stop(); };
  }, [facing, shot]);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) {
      setErr((prev) => prev || "카메라가 아직 준비되지 않았어요. 권한을 허용한 뒤 잠시 기다려 주세요.");
      return false;
    }
    const vw = v.videoWidth, vh = v.videoHeight;
    let sw, sh, sx, sy;
    if (vw / vh > targetAR) { sh = vh; sw = vh * targetAR; sx = (vw - sw) / 2; sy = 0; }
    else { sw = vw; sh = vw / targetAR; sx = 0; sy = (vh - sh) / 2; }
    const scale = Math.min(1, max / Math.max(sw, sh));
    const cv = document.createElement("canvas");
    cv.width = Math.round(sw * scale); cv.height = Math.round(sh * scale);
    cv.getContext("2d").drawImage(v, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL("image/jpeg", 0.72);
    setShot(url); onCapture(url);
    return true;
  }
  function retake() { setShot(""); setErr(""); onCapture(""); }
  useImperativeHandle(ref, () => ({ capture, retake }));

  if (err)
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px dashed #f1cdc8", background: "var(--danger50)", borderRadius: "var(--radius)", padding: "18px 16px", textAlign: "center", color: "var(--danger)", fontSize: 13, lineHeight: 1.6 }}>
        {err}
      </div>
    );

  if (shot)
    return (
      <div style={{ position: "relative", width: "100%", height: "100%", background: "#000", borderRadius: 14, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img src={shot} alt="촬영본" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", ...(isUser ? { transform: "scaleX(-1)" } : {}) }} />
        <button type="button" onClick={retake} style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", padding: "9px 18px", borderRadius: 999, border: "none", background: "rgba(0,0,0,.62)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>↺ 다시 촬영</button>
      </div>
    );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 14, overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: isUser ? "scaleX(-1)" : "none" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ width: isUser ? "64%" : "88%", aspectRatio: isUser ? "3 / 4" : "3 / 2", border: "2px dashed rgba(255,255,255,.9)", borderRadius: 12, boxShadow: "0 0 0 2000px rgba(0,0,0,.30)" }} />
      </div>
      {guide && <div style={{ position: "absolute", left: 0, right: 0, bottom: 12, textAlign: "center", color: "#fff", fontSize: 12.5, fontWeight: 700, textShadow: "0 1px 4px rgba(0,0,0,.7)", pointerEvents: "none" }}>{guide}</div>}
    </div>
  );
});

export default CameraCapture;
