# 전자계약·PDF·프리패스 ERP 연동 구현 검증

검증일: 2026-08-09
검증자: Codex
판정: **CONDITIONAL PASS — 기능 구현 완료, 배포 환경 연동 스모크 필요**

## 사용자 요구사항

- 관리자가 계약 발급·링크 전달·진행 확인·완료 PDF 확인을 모두 대행한다.
- 회원사 사용자가 직접 처리할 기능은 당분간 없다.
- 착한거래는 문자·카카오를 발송하지 않고 서명 링크만 발급한다.
- 손님이 서명하면 프리패스 ERP 목록에 `서명완료`가 표시된다.
- 서명 시점의 계약서를 PDF로 고정 보관하고 관리자만 열 수 있다.

## 구현 결과

### 착한거래 (`C:/dev/chakhandeal`)

- 발급 응답의 `signUrl`을 링크 전용 계약으로 명시했다. `/send` API는 사용하지 않는다.
- 서명 완료 전에 서버에서 A4 PDF를 생성해 비공개 Storage 또는 로컬 저장소에 보관한다.
- PDF 바이트의 SHA-256과 크기, 저장 경로를 계약 인스턴스에 기록한다.
- 회원사 상태 API에 완료 상태·진행 단계·PDF 메타데이터를 제공한다.
- PDF 다운로드 시 저장 파일의 SHA-256을 다시 계산해 봉인 시점 값과 다르면 503으로 차단한다.
- 문서 존재·서명 여부를 인증 전에 조회하지 않도록 인증 순서를 변경했다.
- 같은 계약에 동시 서명 요청이 들어오면 Firestore transaction 기반 임대 잠금으로 한 요청만 완료한다.
- Puppeteer `24.15.0`과 Chromium `138.0.2`를 같은 메이저 버전으로 정렬하고 서버리스용 `headless: "shell"` 실행 인자를 적용했다.

### 프리패스 ERP (`C:/dev/freepasserp4`)

- 발급 응답에서 `signUrl`을 받아 `esign_sign_url`에 저장한다.
- 존재하지 않는 착한거래 `/send` 호출과 SMS 요청을 제거했다.
- 관리자 전자계약 화면은 서명 링크를 복사·열기할 수 있다.
- 발급된 계약을 15초마다 착한거래 상태 API와 동기화한다.
- `issued/opened/signed/expired` 상태와 진행 단계·동의·서류·본인확인·봉인·PDF 메타데이터를 v4 계약 오버레이에 투영한다.
- PDF까지 준비된 `signed`만 ERP의 `서명완료`로 확정한다.
- 관리자 인증 PDF 프록시를 추가했다. 브라우저에 착한거래 API Key를 노출하지 않으며 양쪽 SHA-256을 대조한다.
- 회원사·영업자 기능은 추가하지 않았고 상태 동기화와 PDF 열람은 관리자만 허용한다.

## 검증 결과

### 착한거래

- `npm test`: **10 files, 68 tests PASS**
  - 동시 서명 2건 중 1건만 200, 다른 요청은 409
  - 저장 PDF 변조 후 다운로드 503
  - 미인증 문서 요청은 존재 여부와 무관하게 동일한 403
- `npm run spec:check`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS
- 실제 PDF 생성: A4 18페이지, 약 2.8MB
- Poppler 렌더링 후 1·10·18페이지 육안검사: 한글·표·서명 영역·부속서 전환 정상, 잘림·겹침 없음

### 프리패스 ERP

- `npx tsc --noEmit --incremental false`: PASS
- `scripts/sim-chakhandeal-sync.mts`: 9/9 PASS
- `scripts/sim-chakhandeal-esign.mts`: 29/29 PASS
- `scripts/sim-esign-progress.mts`: 44/44 PASS
- `scripts/sim-agent.mts`: 44/44 PASS
- 별도 `NEXT_DIST_DIR` 프로덕션 빌드: PASS
- `check:fonts`: PASS
- 기존 전체 저장소 게이트 잔여:
  - `check:ui`는 이번 변경과 무관한 기존 raw-control 3건으로 FAIL
  - `sim-phase12`는 이번 변경과 무관한 `PageToolBar` 기준 1건으로 68/69

## 남은 운영 게이트

- 두 앱의 실제 배포 환경에 `CHAKHANDEAL_API_BASE_URL`, `CHAKHANDEAL_API_KEY`, `CHAKHANDEAL_MEMBER_COMPANY`, `CHAKHANDEAL_TEMPLATE_ID`, 착한거래 공개 도메인 설정이 필요하다.
- Preview 환경에서 `발급 → 링크 서명 → 15초 이내 ERP 완료 → PDF 열기` 실연동 스모크를 수행해야 한다.
- 운영 RTDB write, Rules 변경·게시, Production 배포는 이번 작업에서 실행하지 않았다.
- 착한거래 운영 의존성 감사 기준선은 Critical 0, High 5, Moderate 16으로 남아 있다. PDF 신규 직접 의존성에서 보고된 항목은 아니지만 출시 보안 게이트에서 별도 판단이 필요하다.

## 최종 판정

요청한 링크 전용 전자계약·ERP 완료 동기화·서명 PDF 보관/열람 로직은 구현 및 로컬 검증을 완료했다. 코드 기준 판정은 **PASS**, Production 투입 판정은 실제 양쪽 배포 환경 스모크 전까지 **CONDITIONAL PASS**다.
