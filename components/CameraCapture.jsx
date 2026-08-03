"use client";

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { tap } from "@/lib/haptic";

/** PC 시연용 — 카메라 실패 후에만 쓰는 가짜 촬영본 */
function mockShotDataUrl(facing, max) {
  const isUser = facing === "user";
  const ar = isUser ? 3 / 4 : 3 / 2;
  const w = Math.min(max || 1100, isUser ? 720 : 1100);
  const h = Math.round(w / ar);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#3a424c");
  g.addColorStop(1, "#1c2228");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (isUser) {
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

    const ph = ch * 0.55;
    const pw = ph * 0.75;
    ctx.fillStyle = "#d9d2c5";
    roundRect(ctx, padX + cw * 0.07, padY + ch * 0.18, pw, ph, 8);
    ctx.fill();
    ctx.fillStyle = "#a89f90";
    ctx.font = `600 ${Math.round(w * 0.028)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("사진", padX + cw * 0.07 + pw / 2, padY + ch * 0.18 + ph / 2 + 6);

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

/**
 * 라이브 카메라. soft=true면 PC 등에서 권한 실패 시에만 가짜 촬영본.
 * 실폰은 soft=false — 실제 카메라만 사용.
 */
const CameraCapture = forwardRef(function CameraCapture({
  facing = "environment",
  max = 1100,
  onCapture,
  guide,
  soft = false,
}, ref) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const statusRef = useRef("starting"); // starting | live | failed
  const [err, setErr] = useState("");
  const [shot, setShot] = useState("");
  const [status, setStatus] = useState("starting");
  const isUser = facing === "user";
  const targetAR = isUser ? 3 / 4 : 3 / 2;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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
      setStatus("starting");
      statusRef.current = "starting";

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("failed");
        statusRef.current = "failed";
        if (!soft) setErr("이 브라우저에서는 카메라를 사용할 수 없습니다.");
        return;
      }

      try {
        // ideal → 실폰에서 후면/전면 선택, exact는 일부 기기가 실패함
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: isUser ? 720 : 1280 },
            height: { ideal: isUser ? 960 : 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.setAttribute("playsinline", "true");
          v.muted = true;
          await v.play().catch(() => {});
        }
        setStatus("live");
        statusRef.current = "live";
      } catch {
        setStatus("failed");
        statusRef.current = "failed";
        if (!soft) {
          setErr("카메라를 열 수 없습니다. 브라우저에서 카메라 권한을 허용한 뒤 다시 시도해 주세요.");
        }
      }
    }

    if (!shot) start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, shot, soft, isUser]);

  function capture() {
    const v = videoRef.current;
    if (v && v.videoWidth > 0) {
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

    // 카메라 준비 중이면 가짜로 넘어가지 않음 (실폰 촬영 보장)
    if (statusRef.current === "starting") return null;

    // PC 시연: 권한 실패 후에만 가짜 촬영본
    if (soft && statusRef.current === "failed") {
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

  useImperativeHandle(ref, () => ({ capture, retake, getStatus: () => statusRef.current }));

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
          onClick={tap(retake)}
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
      {/* video는 항상 같은 노드 — remount 시 스트림이 끊기지 않게 */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: isUser ? "scaleX(-1)" : "none",
          opacity: status === "live" ? 1 : 0,
        }}
      />
      {status !== "live" && (
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at center, #2a323c 0%, #111 70%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,.75)", fontSize: 13, fontWeight: 600,
        }}>
          {status === "starting" ? "카메라 준비 중…" : soft ? "" : "카메라 없음"}
        </div>
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
