# Phase 1 구현 지시서 — 불변 ID + 본인확인 토큰 구조

버전 1.0 · 2026-08-03 · 대상: 구현(Cursor) · 상위: [SECURITY-DESIGN.md](./SECURITY-DESIGN.md)
결정 반영: D1=Firestore+앱 봉투암호화 · D2=IdV 스텁 · D5=예외접근 2인승인.

> **목표**: 이후 모든 권한·암호화·열람권한이 딛고 설 두 기반을 깐다 — ① 불변 식별자(companyId·userId), ② 서버 발급 본인확인 토큰의 구조. **암호화·grant·감사·관리자 마스킹은 이 단계에서 하지 않는다.**
> **불변 제약**: 이 단계는 순수 additive여야 한다. 실행 중인 데모(로그인 칩·동의·내 상태 보기·콘솔·검증링크) 전부 계속 green이어야 하고, `npm run build` 통과해야 한다.

---

## 0. 스코프

**In**: companyId(회사 불변 UUID)·userId(정보주체 불변 UUID) 도입, 레코드에 `ownerCompanyId`·`subjectUserId` 추가, 스코프 쿼리를 companyId 우선으로, 본인확인 토큰(`lib/server/identityToken.js`) 발급/검증 구조.
**Out(후속 Phase)**: PII 봉투암호화(P3), consent_grant 열람권한(P4), append-only·불변감사(P5), 관리자 마스킹·break-glass(P6), 본인 경로에서 name+birth 강제 제거(P2 — 구조만 준비, 강제 전환은 Phase 2).

---

## 1. 식별자 도입

### 1.1 companyId (회사 불변 UUID)
- **발급 지점**: 회원 승인 시. `app/api/v1/admin/members/route.js` POST approve 분기 — 현재 `genCode()`만 부여([route.js:60-69](../app/api/v1/admin/members/route.js#L60)). `code`와 함께 `companyId = crypto.randomUUID()`를 members 문서에 저장(Firestore·mock 양쪽: `mockApproveMember`도 companyId 인자 추가).
- **불변**: 한 번 부여되면 승인 재실행·상호 변경에도 유지. approve 시 기존 companyId 있으면 재사용.
- **빌트인/데모 계정 백필**: `test@test.com`·`pet@test.com`·`dudguq@gmail.com`은 승인 절차를 안 거치므로, `lib/auth.js` BUILTIN과 `app/api/v1/auth/issue/route.js` BUILTIN에 **고정 companyId 상수**를 박아 데모가 안정적이게(예: `CID_TEST_RENT`, `CID_PET`, admin은 companyId 없음). 상수는 `lib/server/ids.js`(신설)에 모아 SSOT.
- `4자리 code`는 **링크 귀속 UX용으로만** 존치. 권한 판정에서는 쓰지 않는다(그건 Phase 2).

### 1.2 userId (정보주체 불변 UUID)
- **정의(D3 잠정)**: 실 IdV 전까지는 완전한 전역 person 레코드를 만들지 않는다. 대신 **본인확인 토큰 발급 시 userId를 결정**한다(아래 §2). 데모에서는 샘플 인물별로 **결정적 userId**를 시드(`lib/demo.js` DEMO_USERS에 `userId` 상수 추가: 김신규/홍길동/김반려 각 고정 UUID). 실 IdV 도입 시 phone_lookup_token 기반 dedup으로 교체(TODO 주석).
- 씨앗 거래이력(`mockStore.js` seedRisks)에 `subjectUserId`를 대응 인물의 고정 userId로 채운다(홍길동·김반려는 DEMO_USERS와 동일 userId여야 데모에서 "내 이력"이 이어짐).

### 1.3 레코드 스키마 (additive)
아래 3개 쓰기 경로에 필드 **추가**(기존 필드 유지):
| 저장 함수 | 파일 | 추가 필드 |
|---|---|---|
| `registerRisk` | [lib/server/risks.js:60](../lib/server/risks.js#L60) | `ownerCompanyId`(actor.companyId), `subjectUserId`(있으면) |
| `completeConsent` | [lib/server/consent.js](../lib/server/consent.js) | `ownerCompanyId`(대상 회원사 companyId), `subjectUserId`(본인확인 토큰 userId) |
| `submitCertificate` | [lib/server/certificate.js:57](../lib/server/certificate.js#L57) | `ownerCompanyId`(providerCode→회원사 companyId), `subjectUserId` |

---

## 2. 본인확인 토큰 (`lib/server/identityToken.js` 신설)

세션 토큰(회사 member용, session.js)과 **별개**. 정보주체(손님)가 "본인임"을 증명하는 토큰.

```
issueIdentityToken({ userId, name, birth, phone }) → "idv.<b64url(payload)>.<sig>"
  payload = { userId, nameHash, birthHash, phoneHash, method, exp }  // 원문 대신 HMAC 바인딩
verifyIdentityToken(token) → { userId, method } | null   // 서명·만료 검증
```
- 서명키는 **세션키와 또 별개**(`IDENTITY_SIGNING_SECRET` env; 미설정+운영이면 fail-closed, 데모는 부팅 랜덤 — session.js:secret() 패턴 복제).
- `nameHash/birthHash/phoneHash`는 HMAC으로 바인딩만(원문 미포함). 토큰이 특정 신원에 묶였음을 증명하되 토큰 자체가 PII를 새지 않게.
- **발급 지점(스텁)**: 데모 AuthFlow가 "본인확인 완료"로 넘어갈 때(`onVerified`) 서버 라우트 `POST /api/v1/idv/issue`(신설)가 샘플 인물의 시드 userId로 토큰 발급. 실 IdV(PASS) 연동 시 이 라우트 내부만 교체.
- **이 단계에선 소비를 강제하지 않는다.** 발급·검증·클라 보관(sessionStorage)까지만. 본인 경로(consent/cert)가 이 토큰을 *요구*하도록 바꾸는 건 Phase 2.

---

## 3. 세션 actor에 companyId 싣기

- `issueDemoToken`([session.js:22](../lib/server/session.js#L22)) payload에 `companyId` 추가.
- `verifyDemoToken`·`verifyFirebaseToken`이 `companyId`를 actor에 실어 반환. Firebase 경로는 members 문서의 companyId를 읽음([session.js:82-91](../lib/server/session.js#L82)).
- `resolveActor` 결과 actor에 `companyId` 포함. `requireActor`는 변경 없음(Phase 2에서 companyId 검증 훅 추가).
- `app/api/v1/auth/issue/route.js` BUILTIN·mock 세션에 companyId 포함.

---

## 4. 스코프 쿼리 companyId 우선 (호환 유지)

기존 상호/코드 매칭을 **끊지 말고**, companyId가 있으면 우선하도록:
- 검증수신 목록 `listCertificatesForProvider`([certificate.js:108](../lib/server/certificate.js#L108)): `ownerCompanyId===actor.companyId` OR (레거시) 기존 상호/코드. → 신규 레코드는 companyId로, 구 레코드는 상호로.
- 동의 목록 `/api/v1/consents`([route.js](../app/api/v1/consents/route.js)): 동일 패턴.
- 이렇게 하면 데모 데이터(companyId 백필됨)와 미래 데이터 모두 동작.

---

## 5. 마이그레이션 / 백필

- **Firestore**: 일회성 스크립트 `scripts/backfill-ids.mjs`(신설) — 기존 members에 companyId 없으면 부여, 기존 risks/consents/certificates에 ownerCompanyId(회사 매칭)·subjectUserId(가능한 경우) 채움. 멱등.
- **mock/데모**: 코드 상수로 결정적 부여(§1.1·§1.2)라 스크립트 불필요.
- 실데이터가 아직 없으므로(데모 단계) Firestore 백필은 실 데이터 투입 전 1회면 충분.

---

## 6. 수용 기준 (이걸로 완료 판정)

1. `npm run build` 통과, 실행 중 데모 3동선(로그인 칩→콘솔 / 동의 및 내 상태 보내기 / 내 상태 보기) 전부 기존대로 green.
2. 회원 승인 시 members 문서에 `companyId`(UUID) 존재, 재승인해도 불변.
3. 로그인 후 `/api/v1/auth/issue` 세션·`resolveActor` actor에 `companyId` 실림.
4. `POST /api/v1/idv/issue`가 본인확인 토큰 발급, `verifyIdentityToken`이 왕복 검증(서명 위조·만료 토큰은 null).
5. 신규 동의/등록/검증 레코드에 `ownerCompanyId`·`subjectUserId` 채워짐. 검증수신 목록이 companyId로도 스코프됨(구 상호 스코프도 유지).
6. 씨앗 홍길동·김반려의 `subjectUserId`가 DEMO_USERS의 userId와 일치(내 이력 연결 준비).
7. **회귀**: Phase 0에서 닫은 것 유지 — 레포 상수로 세션/신원 토큰 위조 불가, 운영(!DEMO) 무인증 오라클 403, /v·목록 응답 PII 마스킹.

**아직 아님(Phase 2가 판정)**: 본인 경로가 name+birth 대신 토큰을 *강제*, canReadTransaction 3-조건, 데모에서도 오라클 차단.

---

## 7. §14 검수 테스트와의 관계

Phase 1은 §14 테스트를 통과시키지 못한다(그건 Phase 2 canReadTransaction부터). 다만 테스트가 딛을 **식별자·토큰 토대**를 놓는다. §14 6테스트의 자동화 하네스는 Phase 7(vitest 계약테스트 + rules 에뮬레이터)에서, 각 Phase 종료 시 해당 테스트를 점진 활성화한다. Phase 1 산출물 검증은 위 §6 수용 기준으로 갈음.
