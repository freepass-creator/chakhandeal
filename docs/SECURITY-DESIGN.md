# 착한거래 개인정보·거래이력 보안·권한 설계

버전 0.1 · 2026-08-03 · 상태: 설계(구현 착수 전, 사용자 결정 대기)
근거: 사용자 확정 요구사항 15섹션(§) + 전수조사(2026-08-03) + 갭분석 5 워크스트림.

> **정체성**: 착한거래는 기업이 이용자를 **검색**하는 시스템이 아니라, **본인이 자기 거래이력을 통제하고 필요한 상대에게 직접 제출**하는 시스템이다. 이 문서의 모든 설계는 이 한 문장에서 파생된다.

---

## 0. 불변식 (무엇을 구현하든 위반 불가)

| # | 불변식 | 스펙 |
|---|---|---|
| I1 | 거래이력 조회 = `isDataSubject ∨ isOwnerCompany ∨ hasValidConsentGrant` 중 하나만. 그 외 403. | §13 |
| I2 | 이름·전화·생년·주민·면허·공통ID로 타사/전체 이력의 조회·**존재여부**·건수 확인 불가. | §1·§3 |
| I3 | 회사간 공통 고객번호 없음. `company_user_token = HMAC(회사별키, user_id)`, 회사끼리 대조해도 동일인 식별 불가. | §3·§6 |
| I4 | 개인정보(암호화)와 거래이력(가명)을 분리 저장. 평문 PII를 DB에 두지 않음. 검색용은 서버키 HMAC. 키는 DB 밖 KMS. | §4·§5 |
| I5 | 본인 제출은 회사·기간·횟수·항목·재공유·다운로드를 본인이 통제. 기본값: 지정회사만·7일·재공유금지·원문최소·만료후 차단. | §7·§8 |
| I6 | 등록 이력 임의 덮어쓰기·완전삭제 금지. append-only 변경이력. 본인 이의제기 반영. | §9 |
| I7 | 관리자도 원문 자유조회 불가. 예외접근(사유·가능하면 2인승인)+감사기록만. | §10 |
| I8 | 감사로그는 append-only·불변, 일반관리자도 수정/삭제 불가. | §11 |
| I9 | 권한 차단은 화면이 아니라 **서버 API + DB 규칙**에서 강제. | §12·§13 |
| I10 | §14 6개 검수 테스트를 상시(자동) 통과. | §14 |

---

## 1. 현재 상태 (2026-08-03)

**Phase 0(커밋 5ba0c1d)에서 닫은 것 — 배포 블로커 8건**: 세션 서명키 분리(위조 차단), 클라 평문 비번 제거, 조용한 재로그인 제거, 무인증 `{이름,생일}` 오라클을 운영(!DEMO)에서 403, 응답 실명·생년·전화 마스킹, 운영·Firebase 미설정 시 fail-fast.

**아직 미충족 — 스펙의 본체는 대부분 미구현.** 요약:

| 영역 | 현재 코드 실태 | 위반 불변식 |
|---|---|---|
| 조회 권한 | `requireActor`는 role/status만 검사. 본인 여부·회사 소유 여부 미검증. 3-조건(canReadTransaction) 없음. | I1 |
| 본인 증명 | 본인 경로가 body의 `{name,birth}`를 신원으로 신뢰(소유 증명 없음). `identityVerified:true` 하드코딩. | I1·I2 |
| 교차검색 | `/api/v1/check`가 임의 이름+생년으로 이력 유무·건수·회사명 반환(=금지된 검색 오라클). **DEMO에서 개방.** | I2 |
| 공통ID | 전역 단일키 `matchKey=HMAC(name|birth)` — 모든 회사가 같은 사람에 동일값. 회사간 상관 가능. | I3 |
| 소유 판정 | 스코프 키가 가변 상호 문자열 + 추측가능 4자리 코드. | I1 |
| 저장 | 성명·생년·전화·면허가 전부 **평문** 저장(risks/consents/certificates). 암호화·KMS·vault 전무. | I4 |
| 제출 통제 | 열람권한이 만료(7일)+콘솔귀속 2축뿐. 횟수·항목·재공유·철회·회사강제 없음. 링크는 무인증 무제한 열람. | I5 |
| 무결성 | `resolveAppealServer`가 원본 status를 in-place 덮어씀. 변경이력·버전 없음. 이의제기 미반영(appealsOpen=0 하드코딩). | I6 |
| 관리자 | admin이 role만으로 전건 평문 열람. 예외접근·2인승인·열람감사 전무. 관리자=하드코딩 이메일 1개. | I7 |
| 감사 | 8종만 기록(읽기·거부·로그인 누락). 해시체인·불변성 없음. 실패 시 조용히 mock 폴백(유실 은폐). meta에 원문 PII. | I8 |
| DB강제 | firestore.rules는 전부 `if false`(클라 전면차단)뿐. Admin SDK가 규칙을 우회 → 3-조건·불변·admin차단이 규칙층에 없음. | I9 |
| 테스트 | 자동화 테스트 0개. 회귀 방지선 없음. | I10 |

---

## 2. 목표 아키텍처 — 5개 기반 프리미티브

스펙 전체는 아래 5개 위에 세워진다. **이 프리미티브가 임계경로**이고, 없으면 나머지가 전부 막힌다.

### P1. 불변 식별자 (immutable IDs)
- `member.memberId`(UUID), `member.companyId`(UUID) — 승인 시 서버 발급, 이후 불변. 세션 토큰·Firebase 프로필에 `companyId` 포함.
- `person.userId`(UUID) — 정보주체 1인 1개.
- 거래이력·검증·동의 각 문서에 `subjectUserId`·`ownerCompanyId`(UUID) 저장.
- 4자리 코드는 **링크 귀속 UX용으로만** 남기고 권한 판정에서 배제.

### P2. 서버 발급 본인확인 토큰 (isDataSubject 증명)
- 실 IdV(PASS/휴대폰 등) 성공 시 서버가 `(userId, 이름·생년·전화 바인딩, 만료)` HMAC 토큰 발급.
- 본인 경로는 body의 `name+birth`를 **버리고** 이 토큰의 `userId`로만 자기 이력 조회.
- `name+birth`로 임의 조회하는 코드 경로 제거 → I2 달성.

### P3. 개인정보 금고 + 봉투암호화 (PII vault)
- 별도 저장소 `pii_vault/{piiId}`: `{ enc: {ciphertext, iv, tag, wrappedDek}, key_version }`. AES-256-GCM.
- 거래이력·동의·검증은 평문 대신 `piiRef(=piiId)` + `matchKey` + `phone_lookup_token`만 보관.
- KEK는 **KMS**(Cloud KMS 또는 AWS KMS), 레코드/버전별 DEK. `key_version`으로 로테이션.
- 운영키 미설정 시 fail-closed(Phase 0의 fail-fast 패턴 재사용).

### P4. 이중 토큰 모델 (교차매칭 vs 회사격리)
> **핵심 긴장**: 이 서비스의 가치 자체가 "A사가 등록한 미납이 (본인 제출 시) B사 검증에 반영"인 교차매칭인데, §6의 회사별 토큰을 매칭키에 쓰면 교차매칭이 불가능해진다. 해소는 **토큰을 둘로 분리**:
- **전역 위험조인키** = 불투명 가명 토큰. PII를 vault로 뺀 뒤 플랫폼 내부 매칭 전용. (현 matchKey 자리, 단 원문 분리 전제.)
- **company_user_token** = `HMAC(회사별 KMS키, userId)` — 회사 콘솔 노출·회사-로컬 레코드 귀속 전용. 회사마다 상이, 대조 불가 → I3.

### P5. 열람권한(consent_grant) 1급 모델
- `consent_grants` 컬렉션: `{ grantId, subjectUserId, certId(불변 스냅샷 참조), granteeCompanyId, fields[], startAt, expiresAt, maxUses, usedCount, allowReshare:false, allowDownload:false, revokedAt }`.
- 증명 **사실(불변 스냅샷)** 과 **열람권한(가변: 횟수·철회)** 을 분리 → I5·I6·I8 정합.
- 링크 열람 = grant 소비(트랜잭션으로 usedCount++·만료·revoke·granteeCompany 대조) + 매 열람 감사.

---

## 3. 단계별 계획 (의존순)

각 단계 끝에 해당 §14 테스트를 자동화로 박제한다. blocksLaunch=실서비스(실데이터) 오픈 차단 항목.

### Phase 0 — 배포 블로커 ✅ 완료 (5ba0c1d)
데모/터널 노출을 안전하게, 운영 오설정을 fail-safe하게. 실데이터 오픈은 여전히 불가.

### Phase 1 — 기반: 불변 ID + 본인확인 토큰  【임계경로 · blocksLaunch】
- P1 불변 memberId/companyId 발급·세션/프로필 반영. 스코프 쿼리를 companyId 기준으로 교체(상호·코드 배제).
- P2 서버 발급 본인확인 토큰 스캐폴딩(실 IdV 연동은 아래 결정). 본인 경로에서 `name+birth` 임의조회 제거.
- **이 단계 없이는 Phase 2~6이 전부 막힘.**

### Phase 2 — 권한 강제 (canReadTransaction) 【blocksLaunch】
- 단일 게이트 `canReadTransaction(actor, record) = isDataSubject ∨ isOwnerCompany ∨ hasValidConsentGrant`로 모든 조회 중앙화.
- 본인 경로 4개를 `requireVerifiedSubject`로 감싸고, DEMO에서도 오라클이 열리지 않게 게이트를 **env가 아닌 신원조건**으로 교체(데모는 시드 userId 토큰으로 시연).
- 모든 거부(403) 분기에 감사 기록. §14 ①②④⑤ 테스트 박제.

### Phase 3 — 암호화 분리저장 (PII vault) 【blocksLaunch】
- P3 vault + P4 이중 토큰 도입. registerRisk/completeConsent/submitCertificate 쓰기와 모든 읽기를 암호화/복호 경유로 일괄 전환(경로 인벤토리 후 한 번에).
- 거래이력 테이블 가명화(직접식별정보 제거). checkRisk 레거시 name-평문 폴백 제거 + 기존 데이터 재키잉 마이그레이션.
- 회원사 pw 해시(bcrypt/argon2), 민감 이미지 보호.

### Phase 4 — 본인 제출·열람권한 모델 (consent_grant)
- P5 grant 모델로 링크 열람 재구현: 지정회사·기간·횟수·항목선택·재공유금지·철회·다운로드 플래그. 본인용 "내가 보낸 링크·철회" UI. §14 ③ 박제.

### Phase 5 — 무결성·이의제기·불변 감사 【감사는 blocksLaunch】
- risks를 event-sourcing(또는 현재상태+shadow history)으로: append-only 변경이력, hard delete 금지, 정정/철회는 이벤트. 이의제기 상태를 checkRisk·증명서에 반영(appealsOpen 실집계).
- 감사 12종 확정 + 해시체인(prevHash·seq) + 외부 append-only sink(BigQuery/GCS retention lock). 감사 실패 시 폴백 금지. meta에서 원문 PII 제거.

### Phase 6 — 관리자 최소권한 + 예외접근
- admin 기본을 마스킹 뷰로. 원문은 break-glass(사유 필수 → 가능하면 2인승인 → 감사) 경로로만. 관리자 다중신원(custom claim/admins 컬렉션)로 전환(2인승인 전제). §14 ⑥ 박제.

### Phase 7 — 검수 자동화 (전 단계 병행)
- vitest 계약테스트(라우트 핸들러 직접 호출, DEMO on/off 매트릭스로 상태코드·응답 PII 부재 assert) + `@firebase/rules-unit-testing` 에뮬레이터로 규칙 검증. CI 편입.

---

## 4. DB 규칙(§9 "DB 수준 강제")에 대한 정직한 제약

**Firebase Admin SDK는 firestore.rules를 전면 우회한다.** 따라서 현재처럼 rules를 `if false`로 두고 서버(Admin SDK)만 매개하는 구조에서는, 규칙이 표현하는 건 "클라이언트 전면차단"(기밀성)뿐이고 **3-조건·append-only·불변·관리자차단은 규칙층에 존재하지 않는다.** 스펙 §9/§13의 "DB 수준 강제"를 만족하려면 둘 중 하나:
- **(A) 서버 전량매개 유지** + 3-조건을 서버 `canReadTransaction`에 100% 위임. rules는 클라차단만. → 무결성·불변·admin차단은 **crypto(암호화 저장) + 외부 WORM sink**로 강제(rules로 "완료" 처리 금지).
- **(B) 관계형 DB(Postgres)로 이전** + Row-Level Security로 3-조건을 DB에 실제 강제. 가명화·key_version·조인·참조무결성에도 적합. (프리패스 ERP RLS 하드닝 선례 있음.)

---

## 5. 사용자 결정 필요 (Phase 1 착수 전 선결)

| # | 결정 | 선택지 | 영향 |
|---|---|---|---|
| D1 | **저장 아키텍처** | (a) Firestore 유지 + 앱계층 봉투암호화·pii_vault (b) 관계형(Postgres)+RLS로 이전 | 전 스키마·§9 DB강제 방식 |
| D2 | **본인확인(IdV) 제공자** | PASS / 통신사 / 기타. 없으면 isDataSubject 증명 불가 | Phase 1·2 전제 |
| D3 | **교차매칭 모델 / user_id 정의** | 전역 위험조인키를 무엇으로(가명토큰), user_id를 전역 person id로 볼지 | §6·P4 구현 |
| D4 | **KMS 제공자** | Cloud KMS(GCP·Firebase 동일 프로젝트) / AWS KMS / 임시 env | Phase 3 |
| D5 | **관리자 2인승인 범위** | 모든 원문 vs break-glass만(권장: 예외접근만) + 관리자 다중신원 방식(custom claim vs admins 컬렉션) | Phase 6 |
| D6 | **불변 감사 sink** | 해시체인만 vs 외부 WORM(BigQuery/GCS retention lock) 이중화 | Phase 5 |

---

## 6. 즉시 인지 사항 (near-term)

- **데모(DEMO_MODE=true)에서는 §1·§3이 금지한 "이름+생년 검색" 오라클이 설계상 여전히 열려 있다**(`/check`·`/cert/preview`·`/consent`). 파트너 시연 각본이 이 경로를 태우면, 팔고 있는 신뢰모델과 시연 동작이 모순된다. → 시연은 "본인이 자기 상태를 확인·제출"하는 동선만 태우고, "남을 조회"로 보이는 동선은 피할 것. (또는 데모도 신원조건 게이트로 전환 — Phase 2에 포함.)
- Phase 0가 닫은 것은 **응답 노출·운영 게이트**뿐이며 **저장은 여전히 평문**이다. "보안 처리 완료"로 오인 금지 — 실데이터 투입 즉시 §4 위반.
- 전역 matchKey가 이미 시드에 박혀 회사 경계를 넘는 상관ID로 작동 중 → §3 핵심 금지가 데이터 레이어에 내장. 부분수정 불가, 재키잉 필요.
