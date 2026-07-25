"use client";

import { useEffect, useState } from "react";

const KEY = "cd_device_frame_v1";

/** PC 시연용 기기 프레임 — 실폰·태블릿에서는 쓰지 않음 */
export const DEVICE_FRAMES = [
  { id: "android", label: "Android", w: 360, h: 800, hint: "360×800" },
  { id: "iphone", label: "iPhone", w: 390, h: 844, hint: "390×844" },
  { id: "max", label: "Max", w: 430, h: 932, hint: "430×932" },
];

export default function DeviceShell({ children }) {
  const [desktop, setDesktop] = useState(false);
  const [size, setSize] = useState("iphone");

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)");
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && DEVICE_FRAMES.some((f) => f.id === saved)) setSize(saved);
    } catch { /* */ }
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  function pick(id) {
    setSize(id);
    try { localStorage.setItem(KEY, id); } catch { /* */ }
  }

  // 실폰: 틀 없이 전체 화면. 내부만 스크롤 (바깥 이중 스크롤 없음)
  if (!desktop) {
    return <div className="device device-native">{children}</div>;
  }

  const frame = DEVICE_FRAMES.find((f) => f.id === size) || DEVICE_FRAMES[1];

  return (
    <>
      <div className="device-toolbar" aria-label="PC 시연용 화면 크기">
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
        className="device device-framed"
        data-size={size}
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
