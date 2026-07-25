# 착한거래 UI/UX SSOT (화면 통일 규격)

버전: 1.0 · 2026-07-25 · `rentsafe-pro`  
근거: `app/globals.css` 토큰 + `docs/platform-principles.md` + StepFooter/FlowHeader 관례

> **화면·버튼·진행 바**의 단일 기준.  
> 소프트웨어 설계 원칙(DRY·SOLID·KISS 등 30개)은  
> [`ENGINEERING-PRINCIPLES.md`](./ENGINEERING-PRINCIPLES.md) (P01–P30).

---

## A. 비주얼 토큰 (1–8)

| ID | 규격 |
|----|------|
| **S01** | 색은 CSS 변수(`--navy` `--safe` `--ink` `--line` …)만. 컴포넌트에 임의 hex 금지(카메라·기기 프레임 예외). |
| **S02** | 라운드 `--radius: 8px` 단일. 예외: 진짜 원(50%), 진행바 얇은 선, 카메라 오버레이 pill(`999`). |
| **S03** | 폰트 Pretendard(+ system). Inter/Roboto/Arial 스택 금지. |
| **S04** | 버튼은 `.btn` / `.btn-primary` / `.btn-safe` / `.btn-sm` / `.btn-block`만. |
| **S05** | 입력은 `.field` + input/select/textarea. |
| **S06** | 회원 콘솔 블록은 `.card`. 손님 단계 화면은 `.c-body` (히어로에 카드 남발 금지). |
| **S07** | 손님 타이포: `.slabel` → `.stitle` → `.sdesc`. |
| **S08** | 공유·영수증·패널: `.share-url` `.receipt` `.panel` `.text-link` 재사용. |

## B. 레이아웃·내비 (9–15)

| ID | 규격 |
|----|------|
| **S09** | 손님 단계 화면: `FlowHeader` + 진행 바 + `StepFooter`([이전][다음]). |
| **S10** | 단계 플로우의 주 CTA는 하단 `StepFooter`. (예외: 랜딩 카드, `auth-opt`, 콘솔 카드 액션) |
| **S11** | 진행 바는 **상위 단계만**. 본인확인 안(방법·촬영)은 부제만 바꾸고 바 라벨을 갈아끼우지 않음. |
| **S12** | 동의: `대상 → 본인확인 → 동의 → 서명 → 완료`. |
| **S13** | 내 상태: `본인확인 → 내 상태`. |
| **S14** | 폰 우선. PC는 기기 프레임(Android/iPhone/Max). 실기기는 전체면. |
| **S15** | safe-area `--sat` / `--sab` 헤더·푸터에 반영. |

## C. 제품 UX (16–21)

| ID | 규격 |
|----|------|
| **S16** | 회원 콘솔에 이름·전화 **검색/블랙리스트 조회 없음**. |
| **S17** | 동의 안내 링크·상태 링크: **복사 + 공유** 좌우 1열. |
| **S18** | 증명 = **살아 있는 링크만**. 캡처·문서 복사를 인정하는 카피 금지. |
| **S19** | `신규` = 이력 없음(중립). 불량·낮은 점수처럼 표현 금지. |
| **S20** | 라이브 UI에 「시연」배너/칩 금지. |
| **S21** | 실폰 = 실제 카메라. soft 가짜 촬영은 PC·권한 실패 후에만. |

## D. 인터랙션 (22–27)

| ID | 규격 |
|----|------|
| **S22** | 불가 동작은 `disabled` (예: 코드 없는 링크 보내기, 미서명 완료). |
| **S23** | 클립보드 실패 시 toast/alert로 안내. |
| **S24** | 주요 터치 높이 ≥ ~40px (`.btn` 기본). `.btn-sm`은 보조만. |
| **S25** | loading / empty / error 상태 제공. |
| **S26** | 공유 라벨 통일: 콘솔·상태 모두 **복사 / 공유**. |
| **S27** | 이전 = 직전 상위 단계로 (동의→서명에서 이전 = 동의). |

## E. 화면 완결 (28–30)

| ID | 규격 |
|----|------|
| **S28** | 랜딩 CTA → `/consent`, `/go`. 로그인 → `/console`. 관리자는 `/admin`. |
| **S29** | 콘솔 탭: **안내·동의** / **검증 수신** / **위반 등록**. |
| **S30** | `/v`는 링크 열람 전용 메시지. 선택 행은 `.land-card` / `.auth-opt` 가로 100%. |

---

## 검수 방법

1. 위 ID로 Pass/Fail 표 작성  
2. Fail만 `파일 · 현상 · 심각도 · 수정`  
3. high → med → low 순으로 수정  
4. 수정 후 해당 ID만 재검수  

관련 코드: `components/StepFooter.jsx`, `components/FlowHeader.jsx`, `app/globals.css`
