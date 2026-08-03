// 착한거래 체크 심볼 (브랜드 마크) — 헤더/인증/랜딩 공용
// className 으로 컨테이너 크기·배경(그라디언트) 지정, 내부 체크는 공통.
export default function BrandMark({ size = 18, className = "brand-mark" }) {
  return (
    <span className={className} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
