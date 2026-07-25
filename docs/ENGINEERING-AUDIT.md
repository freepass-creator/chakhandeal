# 엔지니어링 원칙 검수 결과 (P01–P30)

날짜: 2026-07-25 · 대상: `rentsafe-pro` · 기준: [`ENGINEERING-PRINCIPLES.md`](./ENGINEERING-PRINCIPLES.md)

**요약:** Pass **7** · Partial **16** · Fail **7** → 이번 패치로 **P02/P17/P18/P21/P24** 일부 완화 (시연 기본 유지).

> 시연: `NEXT_PUBLIC_DEMO_MODE` 미설정(true). 상용: `NEXT_PUBLIC_DEMO_MODE=false` + `MATCH_HMAC_SECRET` 실키.

---

## 전체 표

| ID | 원칙 | 결과 | 심각도 | 한 줄 근거 |
|----|------|------|--------|------------|
| P01 | SSOT | Partial | med | constants 중심이나 데모 계정·시드 중복 |
| P02 | DRY | Fail | med | VerticalLinkFlow 미사용, 데모 계정 3곳 |
| P03 | SOLID | Partial | low | 서버 모듈 OK, auth.js 비대 |
| P04 | KISS | Partial | low | DEMO/Admin/mock 삼중 경로 |
| P05 | YAGNI | Fail | low | dine/stay·죽은 플로우 선구현 |
| P06 | SoC | Partial | med | API 분리 OK, DEMO 정책이 UI에 스며듦 |
| P07 | SRP | Partial | low | consent가 동의+자동 cert |
| P08 | Coupling | **Pass** | — | UI → API → lib/server |
| P09 | Encapsulation | Partial | med | HMAC 서버측, 평문 name/birth 잔존 |
| P10 | Fail Fast | Partial | med | 검증 있음, DEMO는 느슨 |
| P11 | Idempotency | **Fail** | **high** | 동의/등록 반복 = 중복 레코드 |
| P12 | Stateless | Partial | **high** | 토큰 OK, mock·rateLimit은 메모리 |
| P13 | Backward Compat | **Pass** | — | `/consent?code=` `/v?id=` 유지 |
| P14 | API First | Partial | med | API 있음, OpenAPI 없음 |
| P15 | Service SRP | **Pass** | — | 라우트=어댑터 |
| P16 | Observability | Fail | med | console.error 위주 |
| P17 | Security by Design | **Fail** | **high** | DEMO_MODE 상시, HMAC 폴백 시크릿 |
| P18 | Least Privilege | **Fail** | **high** | consents 로그인만 하면 전체 읽기 가능 |
| P19 | Defense in Depth | Partial | med | rules+API 있으나 DEMO가 구멍 |
| P20 | Zero Trust | Partial | med | register는 강제, 일부 클라 폴백 |
| P21 | Automation | Fail | med | 시드/rules 배포 스크립트 없음 |
| P22 | IaC | Partial | med | rules는 코드, firebase.json 없음 |
| P23 | Immutable | **Pass** | — | Vercel 교체 배포 |
| P24 | CI/CD | **Fail** | **high** | GitHub Actions 없음 |
| P25 | Test Pyramid | **Fail** | **high** | 테스트 파일 0 |
| P26 | Graceful Degradation | **Pass** | — | 카메라/OCR/Admin 없이도 시연 |
| P27 | Resilience | Partial | med | rate limit·OCR 재시도, 단일 프로세스 |
| P28 | Scalability | Partial | med | Admin/mock 분기, 메모리는 확장 약함 |
| P29 | Data Ownership | Partial | med | company 스코프 API, rules 느슨 |
| P30 | Docs as Code | Partial | low | 원칙 문서 신설, README 일부 구식 |

---

## TOP 10 (시연 → 상용)

| # | 위험 | 내용 | 권장 |
|---|------|------|------|
| 1 | Critical | `DEMO_MODE = true` 고정 | 운영 빌드에서 false + 환경변수 |
| 2 | Critical | HMAC 시크릿 폴백 문자열 | 운영에서 없으면 **기동 실패** |
| 3 | Critical | 소스에 데모 비밀번호 | 운영 번들에서 제거·로테이션 |
| 4 | High | CI/CD·테스트 없음 | lint+build 워크플로 |
| 5 | High | 동의/등록 멱등성 없음 | Idempotency-Key 또는 유니크 키 |
| 6 | High | Firestore consents 읽기 과다 | 자사·admin만 |
| 7 | High | mockStore가 운영 폴백 가능 | Admin 없으면 운영 fail-closed |
| 8 | High | 동의 POST 비인증 | 본인확인 세션/서명 토큰 |
| 9 | Med | risks 평문 name/birth | matchKey만 저장으로 이행 |
| 10 | Med | DRY/YAGNI 부채 | VerticalLinkFlow 삭제, 데모 계정 단일화 |

---

## Pass인 이유 (짧게)

- **P08 / P15**: 위험·동의·검증이 서버 API로 모임  
- **P13**: 손님 링크 URL 계약 유지  
- **P23 / P26**: Vercel 배포 + 시연 폴백이 의도대로 동작  

---

## 다음 액션 (선택)

1. **시연 유지:** 지금 상태 유지, TOP 1–3만 운영 env로 잠그기  
2. **상용 1차:** TOP 1–6 수정 + CI  
3. **상용 2차:** 멱등성·동의 세션·평문 제거  

요청하시면 우선순위 번호부터 코드로 진행합니다.
