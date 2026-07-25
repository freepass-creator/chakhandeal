# 착한거래 · 소프트웨어 설계 원칙 (SSOT)

버전: 1.0 · 2026-07-25 · `rentsafe-pro`

> 예전에 말씀하신 「SSOT 30개」는 UI 픽셀 규격이 아니라,  
> **개발·아키텍처에서 흔히 묶는 원칙 체크리스트**에 가깝습니다.  
> UI 화면 통일 규격은 별도: [`UIUX-SSOT.md`](./UIUX-SSOT.md) (S01–S30).

이 문서가 **엔지니어링 판단의 기준 원천(SSOT)** 이다.  
새 기능·리팩터·검수 시 아래 ID로 Pass/Fail 한다.

---

## 핵심 설계

| ID | 원칙 | 한 줄 |
|----|------|--------|
| **P01** | **SSOT** | 같은 사실의 기준 원천은 하나. (`lib/constants.js`, 서버 API, 이 문서) |
| **P02** | **DRY** | 같은 지식·로직을 복사하지 않는다. 공유는 모듈·API로. |
| **P03** | **SOLID** | 변경·확장에 열린 구조. 특히 단일 책임·의존 역전. |
| **P04** | **KISS** | 가능한 한 단순하게.  entourage 추상화 금지. |
| **P05** | **YAGNI** | 당장 필요 없는 기능·분기·업종 확장을 미리 만들지 않는다. |
| **P06** | **SoC** | 관심사 분리. UI / 인증 / 위험매칭 / OCR / 저장을 섞지 않는다. |
| **P07** | **SRP** | 한 모듈·컴포넌트는 한 가지 이유만으로 바뀐다. |
| **P08** | **Loose Coupling / High Cohesion** | 약한 결합, 강한 응집. |
| **P09** | **Encapsulation** | 내부 구현을 감추고, 공개 계약만 의존한다. |

## 동작·계약

| ID | 원칙 | 한 줄 |
|----|------|--------|
| **P10** | **Fail Fast** | 잘못된 입력·상태는 빨리 실패·안내한다. |
| **P11** | **Idempotency** | 같은 요청을 반복해도 결과가 같게 (특히 등록·동의 제출). |
| **P12** | **Statelessness** | 서버 인스턴스에 세션 상태를 묶지 않는다. (토큰·DB·쿠키로) |
| **P13** | **Backward Compatibility** | 이미 돌리는 링크·API·코드를 함부로 깨지 않는다. |
| **P14** | **API First / Contract First** | `/api/v1/*` 계약을 먼저 정하고 UI가 따른다. |
| **P15** | **Single Responsibility per Service** | 라우트·서비스 경계를 책임 단위로. |

## 보안·관측

| ID | 원칙 | 한 줄 |
|----|------|--------|
| **P16** | **Observability** | 실패는 로그로 남기고, 사용자에게는 안전한 메시지만. |
| **P17** | **Security by Design** | 보안은 나중에 붙이지 않는다. (rules, HMAC, rate limit) |
| **P18** | **Least Privilege** | 클라이언트·역할에 최소 권한만. |
| **P19** | **Defense in Depth** | rules + API 검증 + 입력 검증을 겹친다. |
| **P20** | **Zero Trust** | “우리 콘솔에서 왔으니 OK” 하지 않는다. 서버에서 재검증. |

## 전달·운영

| ID | 원칙 | 한 줄 |
|----|------|--------|
| **P21** | **Automation First** | 반복 배포·시드·검수는 자동화한다. |
| **P22** | **Infrastructure as Code** | 환경·규칙은 코드로 (`firestore.rules`, `vercel` 설정). |
| **P23** | **Immutable Infrastructure** | 운영 서버를 손대지 말고 새 배포로 교체. |
| **P24** | **CI/CD** | 작고 자주, 검증된 변경만 main → Vercel. |
| **P25** | **Test Pyramid** | 단위·계약 위주. E2E는 핵심 손님/회원 경로만. |

## 장애·성장·데이터

| ID | 원칙 | 한 줄 |
|----|------|--------|
| **P26** | **Graceful Degradation** | OCR·카메라 실패해도 데모/수동 입력으로 핵심 흐름 유지. |
| **P27** | **Resilience** | 타임아웃·재시도·한도 (rate limit, OCR maxDuration). |
| **P28** | **Scalability** | 서버 매칭·Admin/mock 분기로 수평 확장 여지를 둔다. |
| **P29** | **Data Ownership** | 동의·검증·위반 데이터의 소유(회원사 코드·본인)를 분명히. |
| **P30** | **Documentation as Code** | 원칙·UI 규격·제품 원칙을 repo에 두고 변경과 함께 갱신. |

---

## 헷갈리기 쉬운 다른 “방법론”

| 이름 | 언제 쓰나 |
|------|-----------|
| **12-Factor App** | SaaS/클라우드 앱 배포·설정·프로세스 |
| **AWS Well-Architected** | 클라우드 운영 6대 기둥 |
| **Team Topologies / Platform Eng.** | 조직·내부 개발 플랫폼 |
| **이 문서 P01–P30** | 일상 코드·API·보안 판단 |
| **`UIUX-SSOT.md`** | 화면·버튼·진행 바 통일 |

제품(검색 금지·링크만 증명 등)은 [`platform-principles.md`](./platform-principles.md).

---

## 착한거래에 지금 특히 중요한 것

1. **P01 SSOT** — 카피·업종 문구는 `lib/constants.js` / 서버 응답  
2. **P06 SoC** — 손님 UI ≠ 회원 콘솔 ≠ Admin ≠ OCR  
3. **P14 / P17–P20** — 위험 조회·동의는 서버 API + rules  
4. **P13** — `/consent?code=` · `/v?id=` 깨지 않기  
5. **P26** — 카메라·OCR 없어도 시연 가능, 실폰은 실촬영  
6. **P30** — 이 문서 + UIUX-SSOT를 검수 기준에 포함  

---

## 검수 방법

1. 기능/PR을 P01–P30으로 훑는다 (해당 없는 항목은 N/A).  
2. Fail만 `파일 · 원칙 · 위험 · 조치`로 적는다.  
3. UI 픽셀 문제는 `UIUX-SSOT.md`로 넘긴다.
