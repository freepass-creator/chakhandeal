# RentSafe Pro — Cursor 고도화 프로젝트
# (원본 MVP `rentsafe` / `rentsafe-github` 와 분리)

렌탈·가맹 회원사 대상 자기정보 증명 플랫폼의 **상용 골격** 버전.
Next.js 14 + Firebase + 서버 API(`/api/v1/*`) + HMAC 매칭키.

> 원본 MVP는 흐름 시연용입니다. 이 프로젝트는 위험조회를 서버로 옮기고 rules를 잠급니다.
> PASS/PG 실연동은 다음 페이즈.

## 1차 고도화 요약
- `POST /api/v1/check` — HMAC 매칭 조회 (응답 최소화)
- `POST /api/v1/register` — 위험 등록 (Bearer 인증 + matchKey)
- `POST /api/v1/consent` — 동의 + 확인서 서버 산출 + 사진 증빙
- Firestore `risks` 클라이언트 접근 차단 / Admin SDK 또는 로컬 mock
- OCR rate-limit, 휴대폰 KYC는 `lib/kyc/phoneProvider.js` stub

## 2차 고도화 요약
- `POST /api/v1/auth/issue` — 데모 HMAC 액세스 토큰
- `GET/POST /api/v1/admin/risks|appeals` — 관리자 목록·소명 해제
- `GET /api/v1/member/by-code` — 손님용 업체코드 조회
- `GET /api/v1/consents`, `POST /api/v1/appeals`
- register 시 company 위조 방지(세션의 회원사 강제)

## 3차 고도화 요약
- `GET /api/v1/admin/audits` + 관리자 UI 감사 로그
- `GET/POST /api/v1/admin/members` — 가입 승인/반려 API
- `POST /api/v1/members/register` — 데모 가입 서버 접수
- 버티컬 골격: rent / pet / dine / stay (`VERTICALS`)
- `GET /api/v1/health`

## 4차 — 자기정보 증명 모델
- 원칙 문서: `docs/platform-principles.md`, 펫 기획: `docs/pet-adoption-brief-v0.1.md`
- `POST /api/v1/cert/preview|submit`, `GET /api/v1/cert` (만료 강제)
- 펫 플로우 UI: `/pet?code=2001` (검색 없음 · 검증 링크만)
- `POST /api/v1/check` — 운영 기본 차단 (`ALLOW_PUBLIC_CHECK=1` 로컬만)

## 로컬 실행
```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Firebase Admin 자격(`FIREBASE_ADMIN_*`)이 없으면 **서버 메모리 mock**으로 동작합니다.
시드 데이터: 이름 `홍길동` / 생년월일 `900715` → 거래이력 있음.

## 환경변수
`.env.local.example` 참고.
- `MATCH_HMAC_SECRET` — 매칭키 HMAC (**운영 필수**, 기본값으로는 운영 기동 불가)
- `ALLOW_PUBLIC_CHECK=1` — 레거시 이름·생일 조회 허용(로컬 데모)
- `ALLOW_DEMO_LOGIN=1` — 하드코딩 데모 계정(로컬)
- `FIREBASE_ADMIN_JSON` 또는 `FIREBASE_ADMIN_PATH` — Admin SDK
- `NEXT_PUBLIC_FB_*` / `GEMINI_API_KEY` — 기존과 동일

## Firebase rules
`firestore.rules` / `storage.rules` 를 콘솔에 배포하세요.
`risks`·`consents` create 는 클라이언트에서 막혀 있으므로 **반드시 Admin 자격**이 있는 서버로 써야 합니다.

## 다음 페이즈
- 회원 세션 검증(register), Admin 목록 API
- PASS/통신사 본인확인 실연동
- PG 결제·정산
- 평문 name/birth 필드 완전 제거
