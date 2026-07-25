"use client";

import { useEffect, useState } from "react";

const KEY = "cd_device_frame_v1";

/** 데스크톱 시연용 기기 프레임 — Android / iPhone / Max */
export const DEVICE_FRAMES = [
  { id: "android", label: "Android", w: 360, h: 800, hint: "360×800" },
  { id: "iphone", label: "iPhone", w: 390, h: 844, hint: "390×844" },
  { id: "max", label: "Max", w: 430, h: 932, hint: "430×932" },
];

export default function DeviceShell({ children }) {
  const [size, setSize] = useState("iphone");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && DEVICE_FRAMES.some((f) => f.id === saved)) setSize(saved);
    } catch { /* */ }
    setReady(true);
  }, []);

  function pick(id) {
    setSize(id);
    try { localStorage.setItem(KEY, id); } catch { /* */ }
  }

  const frame = DEVICE_FRAMES.find((f) => f.id === size) || DEVICE_FRAMES[1];

  return (
    <>
      <div className="device-toolbar" aria-label="시연 기기 크기">
        {DEVICE_FRAMES.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`device-chip${size === f.id ? " on" : ""}`}
            onClick={() => pick(f.id)}
            title={f.hint}
          >
            {f.label}
            <small>{f.hint}</small>
          </button>
        ))}
      </div>
      <div
        className="device"
        data-size={ready ? size : "iphone"}
        style={{
          ["--device-w"]: `${frame.w}px`,
          ["--device-h"]: `${frame.h}px`,
        }}
      >
        {children}
      </div>
    </>
  );
}
