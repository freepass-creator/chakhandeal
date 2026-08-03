# Phase 3 구현 지시서 — PII 봉투암호화 + 가명화 저장 + 회사별 토큰

버전 1.0 · 2026-08-03 · 대상: 구현(Cursor) · 상위: [SECURITY-DESIGN.md](./SECURITY-DESIGN.md) · 선행: PHASE1·PHASE2-BRIEF(완료 54eb2ef)
결정 반영: D1=Firestore+앱 봉투암호화 · D4=Cloud KMS 목표(프리-프로덕션은 env-KEK+key_version).

> **목표**: 실데이터 오픈의 최종 관문 — ① 개인정보를 평문으로 저장하지 않는다(AES-256-GCM 봉투암호화, §4·I4), ② 거래이력 테이블을 가명화(직접식별정보 제거, §5), ③ 회사별 서로 다른 식별 토큰(§6·I3), ④ 회원사 비번 해시·민감 이미지 보호.
> **경계**: consent_grant 열람권한(P4)·불변 감사(P5)·관리자 마스킹/break-glass(P6)는 이후. 단 이 Phase가 끝나야 **실인물 데이터 투입 가능**(blocksLaunch 해제의 핵심 조건, 나머지는 실 IdV).

---

## 0. 스코프

**In**: `lib/server/crypto.js`(봉투암호화·key_version), `pii_vault` 저장소, 3개 쓰기경로의 PII를 vault로 이관(레코드엔 piiRef+matchKey+phone_lookup_token만), 모든 읽기경로 복호 경유, `company_user_token`(§6), 회원 pw 해시, 민감이미지 암호화, 기존 평문 마이그레이션, KMS/env-KEK fail-closed, vitest 확장.
**Out**: grant 열람권한(P4)·불변감사(P5)·관리자 최소권한(P6).

---

## 1. 암호화 계층 (`lib/server/crypto.js` 신설)

```
encryptField(plaintext) → { ct, iv, tag, wrappedDek, keyVersion }   // AES-256-GCM 봉투
decryptField({ ct, iv, tag, wrappedDek, keyVersion }) → plaintext
phoneLookupToken(phone) → HMAC-SHA256(lookupKey, normalizePhone(phone))   // 중복확인·전화조회용
```
- **봉투암호화**: 레코드/필드마다 랜덤 DEK(32B)로 AES-256-GCM 암호화 → DEK를 KEK로 래핑(wrappedDek). KEK는 **KMS**(운영: Cloud KMS, `key_version` 라벨) 또는 **env-KEK**(프리-프로덕션: `PII_KEK` 32B hex + `PII_KEK_VERSION`). 복호 시 wrappedDek → DEK 해제 → 필드 복호. 로테이션은 신 KEK로 재래핑(구 keyVersion 복호 유지).
- **키 소스 규칙(기존 패턴 재사용)**: 운영(`NEXT_PUBLIC_DEMO_MODE==="false"`)에서 `PII_KEK`/KMS 미설정 → 기동/요청 실패(fail-closed, [session.js:secret](../lib/server/session.js) 패턴). 데모는 부팅 랜덤 KEK 허용(프로세스 생존 동안, mock과 정합).
- **phone_lookup_token 키·matchKey 키·세션키·IdV키는 전부 서로 다른 키**(용도 분리). `.env.local.example`에 `PII_KEK`·`PII_KEK_VERSION`·`PHONE_LOOKUP_SECRET` 추가.

## 2. 개인정보 금고 (`pii_vault`)

| 저장소 | 형태 |
|---|---|
| Firestore | `pii_vault/{piiId}` = `{ enc: { name?, birth?, phone?, license?, address?, reason? }, keyVersion, createdAt }` — 각 필드값은 §1 봉투 객체 |
| mock(데모) | `g.__rsProStore.pii` = `Map<piiId, {...}>` (인메모리, 프로세스 생존 동안) |

- `piiId = crypto.randomUUID()`. 한 정보주체의 여러 레코드가 같은 사람이어도 **레코드마다 별도 piiId** 가능(단순화) 또는 userId당 1 vault 엔트리(정규화) — **택1은 아래 결정**.
- vault 접근은 서버 전용. Firestore rules는 `pii_vault` 클라 read/write 전면 차단(`if false`).

## 3. 거래이력·검증·동의 가명화 (§5)

3개 컬렉션에서 **직접식별정보(name·birth·phone·license·reason 원문) 제거** → 아래만 남긴다:

| 컬렉션 | 유지 필드 |
|---|---|
| risks | `matchKey`, `phone_lookup_token`, `piiRef`, `type`, `vertical`, `ownerCompanyId`, `company_user_token`, `status`, timestamps |
| consents | `matchKey`, `piiRef`, `ownerCompanyId`, `subjectUserId`, `company_user_token`, `vertical`, `signed`, `cert{unresolved,count,types}`, `photosRef`, timestamps |
| certificates | `matchKey`, `piiRef`, `ownerCompanyId`, `subjectUserId`, `providerCode`, draft(검증결과), `submittedAt` — subjectName/Birth/Phone 원문 제거 |

- **표시가 필요한 곳**(오너 회사 콘솔의 동의자 이름 등)은 **권한 확인(canReadTransaction) 후 vault에서 복호**해 응답. 무인증 링크(/v)·타사에는 복호값을 절대 싣지 않음(이미 마스킹).
- seed(mockStore)·ensureDemoCerts도 vault+가명 구조로 재작성(데모도 평문 미보관).

## 4. 회사별 토큰 (§6 · I3) — 이중 토큰

- **전역 위험조인키 = `matchKey`** 유지(플랫폼 내부 교차매칭 전용). PII를 vault로 뺐으므로 matchKey 노출이 곧 PII는 아님. 단 matchKey HMAC 키는 KMS/env로 보호(저엔트로피 사전공격 대비).
- **회사-대면 식별자 = `company_user_token = HMAC(회사별키, subjectUserId)`**. 레코드 저장 시 `ownerCompanyId`의 회사별키로 계산해 저장. **회사마다 값이 달라** 두 회사가 대조해도 동일인 판별 불가.
  - 회사별키: 회원 승인 시 `companyKeyVersion` 부여 + KEK로 래핑 저장(또는 KMS 파생). 회사별 상수키 금지.
- 콘솔 목록·응답의 사용자 식별은 **company_user_token**으로(전역 subjectUserId·matchKey 노출 금지 — Phase 1/2에서 이미 응답 strip).

## 5. 쓰기경로 (한 번에 전환 — 부분전환 시 평문/암호문 혼재 위험)

| 함수 | 파일 | 변경 |
|---|---|---|
| `registerRisk` | [risks.js:55](../lib/server/risks.js#L55) | name/birth/phone/license/reason → vault 암호화, piiRef·phone_lookup_token·company_user_token 저장. matchKey 유지 |
| `completeConsent` | [consent.js](../lib/server/consent.js) | verified·photos → vault, piiRef 저장 |
| `submitCertificate` | [certificate.js:57](../lib/server/certificate.js#L57) | subjectName/Birth/Phone → vault, piiRef 저장 |

## 6. 읽기경로 (복호는 권한 확인 후에만)

- 관리자 `listAllRisks`([risks.js:99](../lib/server/risks.js#L99)) — Phase 6 전까지는 **가명·마스킹 뷰 기본**(복호 안 함). (원문 복호는 Phase 6 break-glass.)
- 회원 콘솔 `listCertificatesForProvider`·`/consents` — isOwnerCompany 확인 후 필요한 표시필드만 vault 복호(예: 동의자 이름). 생년·전화는 마스킹 유지.
- 검증링크 `getCertificate`(/v) — 복호 없이 검증결과(draft)만. 이름은 마스킹.
- `checkRiskByKey`(Phase 2 신설) — matchKey만 쓰므로 vault 복호 불필요(가명 조회). 레거시 name-평문 폴백은 Phase 2에서 제거됨(재확인).

## 7. 마이그레이션

- `scripts/encrypt-pii.mjs`(신설, 멱등): 기존 risks/consents/certificates의 평문 PII → vault 암호화 이관 후 원문 필드 삭제, piiRef·phone_lookup_token·company_user_token 채움. `package.json`에 `migrate:pii` 스크립트.
- 실데이터 없으면(데모) 불필요 — seed가 이미 암호화 구조.

## 8. 보조 보호

- 회원 pw: `members/register`([route.js:46](../app/api/v1/members/register/route.js#L46))·mock에서 **bcrypt/argon2 해시**(평문 저장 제거). Firebase Auth 모드는 pw 미저장.
- 민감 이미지(신분증·얼굴·사업자): 서버측 암호화 또는 KMS-CMEK 버킷 + 짧은 서명URL(현행 1h) 유지.

## 9. 테스트 (vitest 확장)

- 저장 후 **레코드에 평문 PII 부재** assert(risks/consents/certificates 문서에 name/birth/phone 원문 없음).
- vault 복호 왕복(암호화→복호=원문).
- **두 회사의 company_user_token이 동일 subjectUserId에 대해 서로 다름** assert(§6·I3).
- 권한 있는 오너 복호 성공 / 무권한·링크 경로 복호값 미노출.
- 운영(!DEMO)+KEK 미설정 → 쓰기/읽기 fail-closed.

## 10. 결정 필요 (착수 전)

| # | 결정 | 권장 |
|---|---|---|
| E1 | vault 정규화 | userId당 1 엔트리(중복 PII 제거·정합) vs 레코드당 piiRef(단순). **권장: userId당 1**(실 IdV의 userId 기준). IdV 스텁 동안은 matchKey당 1로 잠정 |
| E2 | KEK 소스 | 운영 Cloud KMS / 프리-프로덕션 env-KEK. 데모 부팅랜덤. **권장 그대로** |
| E3 | reason(위반사유) 취급 | PII 포함 가능 → 암호화 vault(권장) vs 가명 테이블 잔류 |

---

## 11. 수용 기준

1. `npm run build`+`npm test`(신규 암호화 테스트 포함) 통과, 데모 3동선 green.
2. risks/consents/certificates 문서에 **평문 name/birth/phone/license 부재**(vault 경유). 응답·콘솔·링크도 원문 미노출(권한 복호 예외).
3. 동일 subjectUserId에 대해 A·B 회사의 company_user_token이 상이.
4. 운영(!DEMO)에서 PII_KEK/KMS 미설정 시 fail-closed(요청 실패), 데모는 부팅랜덤으로 동작.
5. Phase 0/1/2 회귀 없음(토큰-only·오라클 차단·canReadTransaction·마스킹·§14 vitest 유지).

## 12. 유의

- Phase 3 완료 = **저장 암호화·가명화 달성**. 실데이터 오픈의 남은 조건은 **실 IdV(D2)** 와 P4~P6(열람권한·불변감사·관리자). 즉 Phase 3만으로 오픈 아님.
- 부분전환 금지 — 쓰기/읽기 전 경로 인벤토리 후 일괄 전환(한 경로 누락 시 런타임 복호 실패).
