# 착한거래(chakhandeal) 인계 — 재설치 후 여기부터

최종 갱신: 2026-08-04 · 이 파일은 재설치·세션 교체 후 **가장 먼저 읽는 단일 진입점**이다.
로컬 `.claude` 메모리는 재설치 시 사라질 수 있으므로, 진실은 이 리포(GitHub)에 있다.

리포: `https://github.com/freepass-creator/chakhandeal` · 로컬: `D:\dev\chakhandeal`

---

## 0. 30초 요약

착한거래 = **자기정보 증명 플랫폼**(기업이 이용자를 *검색*하는 게 아니라, **본인이 자기 거래이력을 통제·제출**). 구 rentsafe. 현재 **DEMO 단계**(합성데이터만, 실인물 금지).
보안·권한 재설계를 Phase 0~6으로 쪼개 진행 중. **P0~P3 완료·병합, P4 지시서 나옴(구현 대기), P5/P6·전자계약 미착수.**

---

## 1. 진행 상태 (로드맵)

| Phase | 내용 | 상태 | 커밋 |
|---|---|---|---|
| P0 | 배포 블로커(세션키 위조·평문비번·무인증 오라클·fail-fast) | ✅ 완료·병합 | 5ba0c1d |
| P1 | 불변 ID(companyId/userId) + 본인확인 토큰 구조 | ✅ 완료·검증·병합 | 29e4f15 + 46d90d7 |
| P2 | canReadTransaction + 본인경로 토큰-only + 오라클 차단(데모포함) | ✅ 완료·검증·병합 | 993682b + 54eb2ef |
| P3 | PII 봉투암호화·가명화·회사별 토큰·pw해시 | ✅ 완료·검증·병합 | c3558ff + a041a74 |
| **P4** | **열람권한(consent_grant) + 본인 제출(§14③)** | **지시서만(구현 대기)** | 04de86c(brief) |
| P5 | 불변 감사로그(해시체인·WORM sink) | 미착수(P4 후 지시서) | — |
| P6 | 관리자 최소권한·예외접근 2인승인 | 미착수 | — |
| — | **전자계약/이행이력** (모두싸인+위반근거) | 방향문서만 | MEMBER-ESIGN-REQUEST.md |

각 단계 지시서: `docs/PHASE1-BRIEF.md` ~ `docs/PHASE4-BRIEF.md`. (P0은 지시서 없이 즉시 수정했음.)
보안·권한 설계 SSOT: **`docs/SECURITY-DESIGN.md`** (10 불변식 §0 — 무엇을 하든 위반 금지).

---

## 2. 다음 할 일 (재설치 후 즉시)

1. **Phase 4 구현** — `docs/PHASE4-BRIEF.md` 대로. 착수 전 결정 F1~F3(지시서 §9). consent_grant 모델·`hasValidConsentGrant` 실구현·링크=grant 소비·본인 제출/철회·§14③ vitest.
2. P4 검증·병합 후 → **P5(불변감사)·P6(관리자) 지시서** 작성(P4 코드 기준).
3. **전자계약 설계 지시서** — `docs/MEMBER-ESIGN-REQUEST.md` 방향 기반. 회원사 쪽 설계는 `D:\dev\freepasserp4\docs\ESIGN_CHAKHANDEAL_INTEGRATION.md`.
4. **실데이터 오픈 조건**(전부 충족 전 실인물 금지): P4~P6 완료 + 실 IdV(PASS 등) 연동 + Firebase Admin 설정 + 운영 시크릿(아래 §5) + `NEXT_PUBLIC_DEMO_MODE=false`.

---

## 3. 작업 방식 (3단 파이프라인)

- **설계 = Claude Code** — 지시서 `docs/PHASE*-BRIEF.md` 작성(구현 안 함).
- **구현 = Cursor** — 브랜치 `cursor/phaseN-*`에 구현·push.
- **검증 = Claude Code** — 브랜치 checkout → `npm install`·`npm run build`·`npm test`·런타임 curl + **적대적 검증 워크플로**(다렌즈 병렬 리뷰) → 잡힌 결함 교정 → `git merge --ff-only`로 main 병합 → 브랜치 정리.
- 규칙: 검증 기준은 **지시서 §수용기준 + 원래 요구사항(10 불변식·§14 테스트)**. 붙여넣은 리뷰는 참고, 최종 게이트는 적대적 검증.
- 지금까지 각 Phase가 "Cursor 구현(feat) → Claude 교정(fix)" 2커밋으로 병합됨.

---

## 4. 실행·검증 명령

```
cd D:\dev\chakhandeal
npm install
npm run build          # 타입·린트 게이트
npm test               # vitest 11개 (phase2 5 + phase3 6) — §14 ①②④⑤ + 암호화
npm run dev            # http://localhost:3000
npm run migrate:pii    # (운영) 기존 평문 PII → vault 암호화 마이그레이션
```

- **데모 로그인**: test@test.com/test1234(테스트렌탈·rent), pet@test.com/test1234(해피펫분양·pet), 관리자 dudguq@gmail.com/1234. 로그인 화면 데모칩으로 원클릭.
- **샘플 인물**(idv/issue는 이 셋만 발급, 비샘플 403): 김신규(이력無)·홍길동(900715, rent위반)·김반려(950101, pet위반).
- **데모 동선**: 홈 "동의 및 내 상태 보내기"(/consent, 동의=상태검증 자동귀속) / "내 상태 보기"(/go). 회원 로그인→콘솔(검증수신·거래위반 등록).
- ⚠ **핫리로드 주의**: dev에서 서명키가 부팅마다 랜덤이라, idv 토큰 발급↔소비 사이 라우트가 새로 컴파일되면 키가 회전해 런타임 curl이 간헐 **401**이 난다. 라우트 워밍 후 재시도하면 정상. **vitest는 결정적이니 그걸 신뢰**.

---

## 5. 환경변수 (`.env.local` — gitignore, 재설치 후 재생성)

데모(NEXT_PUBLIC_DEMO_MODE 미설정/true)에선 시크릿 미설정 시 **부팅랜덤**으로 동작(재시작 시 기존 암호문 복호 불가하나 mock도 리셋되므로 무방). 운영(=false)에선 **전부 필수·미설정 시 fail-closed**. 참고: `.env.local.example`.

| 키 | 용도 | 비고 |
|---|---|---|
| `SESSION_SIGNING_SECRET` | 회원 세션 토큰 서명 | 서로 다른 랜덤 |
| `IDENTITY_SIGNING_SECRET` | 본인확인(IdV) 토큰 서명 | 〃 |
| `MATCH_HMAC_SECRET` | 이름+생년 matchKey HMAC | 〃 |
| `PII_KEK` / `PII_KEK_VERSION` | PII 봉투암호화 KEK(64 hex) / 버전 | 〃 |
| `PHONE_LOOKUP_SECRET` | 전화 조회 토큰 HMAC | 〃 |
| `COMPANY_TOKEN_SECRET` | 회사별 토큰 master | 〃 |
| `FIREBASE_ADMIN_JSON` | Firestore Admin(없으면 mock) | 실저장·실오픈 필수 |
| `NEXT_PUBLIC_FB_*` (6) | Firebase 웹 config | |
| `GEMINI_API_KEY` | 신분증/사업자 OCR | |
| `NEXT_PUBLIC_DEMO_MODE` | `false`=운영(게이트·fail-closed 켜짐) | 배포 체크리스트 |
| `ALLOW_DEMO_LOGIN` | 데모 계정 로그인 | 운영 전환 시 제거 |

랜덤 생성: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (키마다 다른 값).

---

## 6. 확정 아키텍처 결정

- **D1** 저장 = Firestore + 앱 봉투암호화. Admin SDK가 firestore.rules를 우회하므로 §9 "DB 강제"는 규칙이 아니라 **① 서버 인가게이트 ② PII 암호화 ③ 외부 WORM 감사** 3층으로. rules만으로 "완료" 처리 금지.
- **D2** 본인확인 = 당장 스텁 → **실데이터 오픈 금지**(데모는 샘플 통과).
- **D5** 관리자 2인승인 = 예외접근(원문 열람)에만.
- D3(교차매칭 user_id)·D4(Cloud KMS)·D6(감사 WORM sink) = 권장안 채택, 세부 후속.

---

## 7. 미해결·이월

- **P4~P6 미구현** (열람권한·불변감사·관리자 최소권한).
- 봉투암호문 **AAD 결속**(keyVersion/piiId) — 운영 KMS 전환 시 하드닝.
- **전자계약/이행이력** 설계·구현 미착수 (방향문서 MEMBER-ESIGN-REQUEST.md만).
- 데모 오라클 폐쇄가 `NEXT_PUBLIC_DEMO_MODE` 단일 env 의존 → 배포 시 반드시 `false` 설정.

---

## 8. 관련 리포·문서

- 회원사(연동측): `D:\dev\freepasserp4`(프리패스 ERP), renman(jpkerp6). 전자계약은 착한거래가 서비스로 구축, 이들은 연동만.
- 이 리포 문서: `docs/SECURITY-DESIGN.md`(설계 SSOT) · `docs/PHASE{1..4}-BRIEF.md`(지시서) · `docs/DEPLOY.md`(배포·시크릿) · `docs/DEMO-SCRIPT.md`(시연 각본) · `docs/MEMBER-ESIGN-REQUEST.md`(전자계약 방향) · `docs/INTEGRATIONS.md`(외부연동 보류목록).
