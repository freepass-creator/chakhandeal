import { ImageResponse } from "next/og";

// 링크 공유 썸네일 (카톡·SNS 미리보기) — 1200x630
export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "착한거래";

export default async function OG() {
  let fonts = [];
  try {
    const data = await fetch(
      "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff/Pretendard-Bold.woff"
    ).then((r) => r.arrayBuffer());
    fonts = [{ name: "Pretendard", data, weight: 700, style: "normal" }];
  } catch {
    fonts = [];
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          backgroundColor: "#16314d", color: "#ffffff", fontFamily: "Pretendard",
        }}
      >
        <div style={{ display: "flex", width: 150, height: 150, borderRadius: 40, backgroundColor: "#13a37a", alignItems: "center", justifyContent: "center" }}>
          <svg width="92" height="92" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: 96, fontWeight: 700, marginTop: 40, letterSpacing: -2 }}>착한거래</div>
        <div style={{ fontSize: 34, color: "#9fb6cc", marginTop: 18 }}>신뢰를 바탕으로 더 좋은 거래 문화를 만드는</div>
      </div>
    ),
    { ...size, fonts }
  );
}
