# Phase 2 구현 지시서 — 권한 강제(canReadTransaction) + 본인확인 토큰-only

버전 1.0 · 2026-08-03 · 대상: 구현(Cursor) · 상위: [SECURITY-DESIGN.md](./SECURITY-DESIGN.md) · 선행: [PHASE1-BRIEF.md](./PHASE1-BRIEF.md)(완료 29e4f15+46d90d7)

> **목표**: 스펙의 심장 — ① 조회 권한을 단일 게이트 `canReadTransaction = isDataSubject ∨ isOwnerCompany ∨ hasValidConsentGrant`로 강제(I1), ② 무인증 `{이름,생년}` 검색 오라클을 **데모까지 포함해** 실제로 닫기(I2·I3), ③ 모든 거부를 감사(I8·§14④⑤).
> **경계**: 암호화 저장(P3)·consent_grant 열람권한 모델(P4)은 아직. 따라서 `hasValidConsentGrant`는 Phase 2에서 **항상 false를 반환하는 스텁**으로 두고(Phase 4가 구현), 외부전달 링크(/v)는 현행 마스킹-누구나 열람을 유지한다(Phase 4가 grant로 대체). Phase 2가 강제하는 실효 조건은 **isDataSubject + isOwnerCompany** 둘.

---

## 0. 스코프

**In**: `canReadTransaction` 게이트 신설·전 조회경로 적용, 본인 경로 4개(check·cert/preview·cert/submit·consent)를 **본인확인 토큰-only**로 전환(name+birth 임의조회·body.subjectUserId 폴백 제거), 토큰에 matchKey 바인딩, idv/issue 오라클 게이트, 거부-감사, §14 ①②④⑤ 자동화(vitest).
**Out**: 필드 암호화·pii_vault(P3), consent_grant 열람권한·링크 횟수/철회(P4), append-only·불변감사(P5), 관리자 마스킹·break-glass(P6). 이들에 의존하는 조건은 스텁.

---

## 1. 핵심 설계 판단 — 토큰-only 조회에서 matchKey를 어떻게 얻나

**문제**: 회사는 거래이력을 `{이름, 생년}`으로 등록한다(플랫폼 userId를 모름). 그래서 위험 레코드의 조인키는 `matchKey = HMAC(이름|생년)`([matchKey.js:48](../lib/server/matchKey.js#L48))다. 그런데 본인 경로를 토큰-only로 바꾸면(무신뢰 `{이름,생년}` 수신 금지), 서버는 "내 이력"을 어떤 키로 조회하나?

**결정(권장)**: **본인확인 토큰 발급 시점**(idv/issue — 이때는 실 IdV가 name+birth를 검증)에서 서버가 matchKey를 계산해 **토큰 payload에 바인딩**한다. 이후 본인 경로는 토큰만 받고, `verifyIdentityToken`이 `{ userId, matchKey }`를 돌려주면 그 matchKey로 상태를 계산한다. **본인 경로는 name+birth를 입력으로 받지 않는다** → 오라클 원천 차단.
- 대안(기각): 매 요청 name+birth 재수신+서버 재계산 — 무신뢰 입력을 다시 받는 것이라 오라클이 그대로 남음.
- 부수 효과: 위험 레코드에 `subjectUserId`(Phase 1)와 `matchKey`(기존)가 공존 → "내 이력"은 `matchKey` 조인으로, "회사 콘솔 귀속"은 `ownerCompanyId`로. 실 IdV 도입 시 userId↔matchKey를 person 저장소로 이관(P3/P4).

---

## 2. 인가 게이트 (`lib/server/authz.js` 신설)

```
canReadTransaction(actor, record) → boolean
  isDataSubject(actor, record)   = actor.subjectToken?.userId && record.subjectUserId === actor.subjectToken.userId
                                   (또는 record.matchKey === actor.subjectToken.matchKey)
  isOwnerCompany(actor, record)  = actor.companyId && record.ownerCompanyId === actor.companyId
  hasValidConsentGrant(...)      = false   // Phase 4 스텁 (TODO)
```
- actor에 두 신원을 실을 수 있게: **회사 세션**(session.js resolveActor, `companyId`)과 **본인확인 토큰**(별도 헤더/바디)을 각각 해석. 요청 종류에 따라 하나 또는 둘.
- `requireVerifiedSubject(req)` 헬퍼: `Authorization`/전용 필드에서 idv 토큰을 꺼내 `verifyIdentityToken` → 없거나 무효면 **401**. 본인 경로 진입 게이트.
- 게이트는 **레코드 단위**로 판정. 목록은 쿼리 자체를 조건으로 좁히고(이미 companyId 스코프), 상세/링크는 canReadTransaction으로 최종 확인.

---

## 3. 본인 경로 4개 전환 (토큰-only)

각 라우트 상단의 Phase 0 `!DEMO_MODE → 403` 게이트를 **`requireVerifiedSubject`로 교체**(DEMO 여부 무관, 토큰 있으면 통과·없으면 401). 데모는 AuthFlow가 idv/issue로 받은 토큰을 실어 통과.

| 라우트 | 현재(Phase 1) | Phase 2 |
|---|---|---|
| `/api/v1/check` | 임의 name+birth로 exists/types/records 반환([check/route.js](../app/api/v1/check/route.js)) | **폐지 또는 토큰-only 자기조회로 축소**. 남긴다면 토큰.matchKey로 "내 상태"만. 타인 조회 형태 제거 |
| `/api/v1/cert/preview` | body {name,birth}로 draft([preview/route.js](../app/api/v1/cert/preview/route.js)) | 토큰-only. `buildCertificateDraft`를 matchKey 기반으로. name+birth 파라미터 제거 |
| `/api/v1/cert/submit` | resolveSubjectUserId 토큰우선+body폴백([submit/route.js:26](../app/api/v1/cert/submit/route.js#L26)) | **토큰-only**(body.subjectUserId/userId 폴백 삭제 — Phase1 TODO 마커 지점). subject 신원=토큰 |
| `/api/v1/consent` | resolveSubjectUserId 토큰우선+폴백([consent.js:18](../lib/server/consent.js#L18)) | **토큰-only**(body/verified/이름매칭 폴백 삭제 — TODO 마커 지점). 본인확인 없는 동의 거부 |

- `checkRisk`([risks.js:19](../lib/server/risks.js#L19))에 `checkRiskByKey(matchKey)` 경로 추가(name+birth 없이). 레거시 name-평문 폴백([risks.js:31-36](../lib/server/risks.js#L31))은 이 단계에서 **제거**(가명화 준비).
- 업종 스코프 규칙(`filterRecordsByVertical`)은 그대로.

---

## 4. idv/issue 오라클 게이트 (Phase 1 이월 must-fix)

[idv/issue/route.js:12](../app/api/v1/idv/issue/route.js#L12) `resolveUserId`가 name+birth→고정 userId를 무검증 매핑하고 userId를 반환 → **존재여부 오라클**.
- **운영(!DEMO)**: idv/issue는 실 IdV 성공 콜백에서만 호출되도록(무인증 name+birth 발급 금지). 실 IdV 전엔 501/403.
- **데모**: 현행 스텁 유지하되, 응답에서 userId를 노출하지 말고(토큰만) 토큰 안에 담아 클라가 직접 못 읽게. 데모 샘플 통과는 유지.

---

## 5. 거부 감사 (I8 · §14④⑤)

- `requireVerifiedSubject`/`canReadTransaction`/`requireActor`의 모든 거부 분기에 `writeAudit({ action: "access_deny", actor, meta: { endpoint, reason } })`. 원문 PII 금지(matchKeyPrefix만).
- 링크 열람(getCertificate)도 열람 감사(`cert_view`) 추가. (불변 감사·해시체인은 Phase 5.)

---

## 6. §14 검수 테스트 자동화 (vitest 신설) — 이 Phase의 게이트

`package.json`에 `test` 스크립트 + vitest. 라우트 핸들러를 직접 import해 `NextRequest`로 호출, DEMO on/off 매트릭스.

| 테스트 | 시나리오 | 기대 |
|---|---|---|
| ① | A(테스트렌탈) 등록 → A토큰·본인토큰·B(해피펫)토큰으로 각각 조회 | A·본인 조회 가능, **B는 403/미노출** |
| ② | B가 임의 {이름,전화,생년}으로 조회 시도(토큰 없음/타인) | 이력·**존재여부·가입여부 전부 비노출**(401/빈결과, exists 오라클 없음) |
| ④ | 인증 없이 API 직접 호출(/consent·/cert/submit·/check) | 접근 거부 + `access_deny` 감사 |
| ⑤ | A직원이 body로 타사 companyId/subjectUserId 주입 | 세션 companyId·토큰 userId가 우선, 주입 무시, 거부 시 보안로그 |

(③ 제출·기간·항목은 Phase 4 grant, ⑥ 관리자는 Phase 6에서.)

---

## 7. 수용 기준

1. `npm run build` + `npm test`(vitest ①②④⑤) 통과. 데모 3동선 green(AuthFlow가 idv 토큰을 발급·첨부하므로 본인 경로 계속 동작).
2. 본인 경로 4개가 토큰 없으면 401, name+birth만으로는 어떤 이력·존재여부도 반환하지 않음(DEMO 포함).
3. cert/submit·consent의 subjectUserId가 **오직 토큰**에서 유도(body 폴백 코드 제거 — Phase1 TODO 마커 해소).
4. 타사(B) 세션으로 A의 거래이력·검증·동의 조회 시 빈결과/403, `access_deny` 감사 남음.
5. body에 companyId/subjectUserId를 주입해도 세션·토큰이 우선(스푸핑 무효).
6. Phase 0·1 회귀 없음(토큰 위조 401, 상관ID 미노출, companyId 스코프 유지).

---

## 8. 유의 (Phase 3/4 경계)

- Phase 2는 **접근 통제**만. 저장은 여전히 평문(P3), 외부링크 열람권한은 만료뿐(P4). 실데이터 오픈은 P3+실IdV 후.
- `hasValidConsentGrant` 스텁이 false이므로, "본인이 A기록을 B에 제출→B 열람"(§7·§14③)은 Phase 4까지 미지원 — 그때까지 B는 본인이 만든 /v 링크로만(현행) 본다.
- name+birth 오라클을 닫으면 데모의 "아무나 조회" 인상은 사라지고 "본인확인 후 내 상태"만 남는다 — 스펙 신뢰모델과 데모가 비로소 일치.
