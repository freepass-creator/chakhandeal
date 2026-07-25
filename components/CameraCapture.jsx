"use client";

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";

/** 카메라 없이 시연용 — 찍힌 것처럼 보이는 JPEG dataURL */
function mockShotDataUrl(facing, max) {
  const isUser = facing === "user";
  const ar = isUser ? 3 / 4 : 3 / 2;
  const w = Math.min(max || 1100, isUser ? 720 : 1100);
  const h = Math.round(w / ar);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");

  // 배경(살짝 노이즈 느낌의 단색 그라데이션)
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#3a424c");
  g.addColorStop(1, "#1c2228");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (isUser) {
    // 얼굴 영역 실루엣
    const cx = w * 0.5;
    const cy = h * 0.42;
    ctx.fillStyle = "#c8b8a8";
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.22, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.28, w * 0.32, h * 0.22, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.font = `600 ${Math.round(w * 0.045)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("본인 얼굴", cx, h * 0.88);
  } else {
    // 신분증 카드
    const padX = w * 0.08;
    const padY = h * 0.12;
    const cw = w - padX * 2;
    const ch = h - padY * 2;
    roundRect(ctx, padX, padY, cw, ch, 14);
    ctx.fillStyle = "#f4f0e8";
    ctx.fill();
    ctx.strokeStyle = "#d0c8b8";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 사진란
    const ph = ch * 0.55;
    const pw = ph * 0.75;
    ctx.fillStyle = "#d9d2c5";
    roundRect(ctx, padX + cw * 0.07, padY + ch * 0.18, pw, ph, 8);
    ctx.fill();
    ctx.fillStyle = "#a89f90";
    ctx.font = `600 ${Math.round(w * 0.028)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("사진", padX + cw * 0.07 + pw / 2, padY + ch * 0.18 + ph / 2 + 6);

    // 텍스트 줄
    const tx = padX + cw * 0.07 + pw + cw * 0.06;
    ctx.textAlign = "left";
    ctx.fillStyle = "#2a2a2a";
    ctx.font = `700 ${Math.round(w * 0.038)}px sans-serif`;
    ctx.fillText("주민등록증", tx, padY + ch * 0.22);
    ctx.font = `600 ${Math.round(w * 0.032)}px sans-serif`;
    ctx.fillText("성명  김신규", tx, padY + ch * 0.38);
    ctx.fillText("생년월일  95.01.01", tx, padY + ch * 0.5);
    ctx.font = `500 ${Math.round(w * 0.026)}px sans-serif`;
    ctx.fillStyle = "#666";
    ctx.fillText("주소  서울특별시 …", tx, padY + ch * 0.64);

    ctx.fillStyle = "rgba(40,40,40,.35)";
    ctx.font = `600 ${Math.round(w * 0.024)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("시연용 촬영본", w / 2, padY + ch - 14);
  }

  return cv.toDataURL("image/jpeg", 0.82);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 라이브 카메라 — 저장사진 업로드 불가, 그 자리 촬영만.
// soft=true: 권한 없어도 뷰파인더처럼 보이고, 촬영 시 가짜 사진으로 확인 단계 진행
const CameraCapture = forwardRef(function CameraCapture({
  facing = "environment",
  max = 1100,
  onCapture,
  guide,
  soft = false,
}, ref) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [err, setErr] = useState("");
  const [shot, setShot] = useState("");
  const [hasLive, setHasLive] = useState(false);
  const isUser = facing === "user";
  const targetAR = isUser ? 3 / 4 : 3 / 2;

  useEffect(() => {
    let cancelled = false;
    function stop() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }
    async function start() {
      setErr("");
      setHasLive(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!soft) setErr("이 브라우저에서는 카메라를 사용할 수 없습니다.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setHasLive(true);
      } catch {
        if (!soft) setErr("카메라를 열 수 없습니다. 브라우저에서 카메라 권한을 허용한 뒤 다시 시도해 주세요.");
      }
    }
    if (!shot) start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, shot, soft]);

  function capture() {
    const v = videoRef.current;
    if (v && v.videoWidth) {
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      let sw, sh, sx, sy;
      if (vw / vh > targetAR) {
        sh = vh;
        sw = vh * targetAR;
        sx = (vw - sw) / 2;
        sy = 0;
      } else {
        sw = vw;
        sh = vw / targetAR;
        sx = 0;
        sy = (vh - sh) / 2;
      }
      const scale = Math.min(1, max / Math.max(sw, sh));
      const cv = document.createElement("canvas");
      cv.width = Math.round(sw * scale);
      cv.height = Math.round(sh * scale);
      cv.getContext("2d").drawImage(v, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL("image/jpeg", 0.72);
      setShot(url);
      onCapture?.(url);
      return url;
    }
    if (soft) {
      const url = mockShotDataUrl(facing, max);
      setShot(url);
      onCapture?.(url);
      return url;
    }
    return null;
  }

  function retake() {
    setShot("");
    setErr("");
    onCapture?.("");
  }

  useImperativeHandle(ref, () => ({ capture, retake }));

  if (err) {
    return (
      <div style={{
        height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        border: "1.5px dashed #f1cdc8", background: "var(--danger50)", borderRadius: "var(--radius)",
        padding: "18px 16px", textAlign: "center", color: "var(--danger)", fontSize: 13, lineHeight: 1.6,
      }}>
        {err}
      </div>
    );
  }

  if (shot) {
    return (
      <div style={{
        position: "relative", width: "100%", height: "100%", background: "#000",
        borderRadius: 14, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <img
          src={shot}
          alt="촬영본"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", ...(isUser ? { transform: "scaleX(-1)" } : {}) }}
        />
        <button
          type="button"
          onClick={retake}
          style={{
            position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
            padding: "9px 18px", borderRadius: 999, border: "none",
            background: "rgba(0,0,0,.62)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}
        >
          ↺ 다시 촬영
        </button>
      </div>
    );
  }

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%", borderRadius: 14,
      overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {hasLive ? (
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: isUser ? "scaleX(-1)" : "none" }}
        />
      ) : (
        <>
          <video ref={videoRef} playsInline muted style={{ display: "none" }} />
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at center, #2a323c 0%, #111 70%)",
          }} />
        </>
      )}
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", pointerEvents: "none",
      }}>
        <div style={{
          width: isUser ? "64%" : "88%", aspectRatio: isUser ? "3 / 4" : "3 / 2",
          border: "2px dashed rgba(255,255,255,.9)", borderRadius: 12,
          boxShadow: "0 0 0 2000px rgba(0,0,0,.30)",
        }} />
      </div>
      {guide && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 12, textAlign: "center",
          color: "#fff", fontSize: 12.5, fontWeight: 700,
          textShadow: "0 1px 4px rgba(0,0,0,.7)", pointerEvents: "none",
        }}>
          {guide}
        </div>
      )}
    </div>
  );
});

export default CameraCapture;
