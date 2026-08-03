// PWA 매니페스트 — 홈화면 설치 시 전체화면 앱처럼 동작
export default function manifest() {
  return {
    name: "착한거래",
    short_name: "착한거래",
    description: "신뢰를 바탕으로 더 좋은 거래 문화를 만드는 착한거래",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#16314d",
    theme_color: "#16314d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.svg", sizes: "180x180", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
