# Phase 4 구현 지시서 — 열람권한(consent_grant) 모델 + 본인 제출

버전 1.0 · 2026-08-03 · 대상: 구현(Cursor) · 상위: [SECURITY-DESIGN.md](./SECURITY-DESIGN.md) · 선행: PHASE1~3(완료 a041a74)

> **목표**: 스펙 §7·§8·§14③ 완성 — ① 증명(불변 스냅샷)과 **열람권한(가변: 회사·기간·횟수·항목·재공유·철회)** 을 분리, ② 본인이 자기 기록을 **특정 회사에·허용 항목만·정해진 기간만** 제출, ③ `hasValidConsentGrant`를 실제 구현(현 스텁 false → grant 검사), ④ 모든 열람 감사.
> **경계**: 불변 감사 해시체인(P5)·관리자 최소권한/2인승인(P6)은 이후. 실데이터 오픈은 이 Phase + 실 IdV(D2) 후에도 P5/P6 남음.

---

## 0. 스코프

**In**: `consent_grants` 1급 모델, `hasValidConsentGrant` 실구현, 링크 열람을 grant 소비로 재구현(getCertificate), 본인 제출 흐름(회사·항목·기간·횟수 선택), 필드 화이트리스트 프로젝션, 본인 철회 + "내가 보낸 링크" 조회, `access`/`cert_view` 감사, §14③ vitest.
**Out**: 감사 불변화(P5)·관리자(P6).

---

## 1. 모델 — 증명 스냅샷 vs 열람권한 분리

**certificate**(기존, 불변) = 검증 사실 스냅샷: `{ id, matchKey, piiRef, ownerCompanyId, subjectUserId, draft(검증결과), submittedAt }`. **한 번 만들면 안 바뀜.**

**consent_grants**(신설, 가변) = 열람권한:
```
{ grantId, subjectUserId, certId(스냅샷 참조),
  granteeCompanyId,          // 열람 허용 회사(지정회사만) · "" 금지(기본 지정필수)
  fields: string[],          // 공개 항목 화이트리스트 (기본 원문최소: ['trustLevel','identityVerified'])
  startAt, expiresAt,        // 기본 지금~+7일
  maxUses, usedCount,        // 기본 maxUses 유한(예 5), usedCount 원자증가
  allowReshare: false,       // 기본 재공유 금지
  allowDownload: false,      // 기본 다운로드 불가
  revokedAt: null,           // 본인 철회 시각
  createdAt }
```
- Firestore rules: `consent_grants` 클라 read/write 전면 차단(서버 전용).
- mock: `g.__rsProStore.grants = Map<grantId, ...>`.

## 2. hasValidConsentGrant 실구현 ([authz.js:6](../lib/server/authz.js#L6))

현재 `return false` 스텁 → 실제:
```
hasValidConsentGrant(actor, record) =
  존재하는 grant 중, grant.certId===record.id
    && grant.granteeCompanyId===actor.companyId
    && !grant.revokedAt
    && now∈[startAt, expiresAt]
    && grant.usedCount < grant.maxUses
```
- `canReadTransaction`은 그대로(isDataSubject ∨ isOwnerCompany ∨ hasValidConsentGrant). 이제 세 번째가 살아남.
- **주의**: 이 판정은 read-only(부수효과 없음). 실제 usedCount 증가·감사는 열람 소비 함수에서(§3).

## 3. 링크 열람 = grant 소비 (getCertificate 재구현)

- 링크는 `certId`가 아니라 **`grantId`**: 공유 URL `/v?g=<grantId>`(기존 `?id=` 병행 지원하되 신규는 grant).
- `consumeGrant(grantId, { readerCompanyId })`:
  1. grant 로드 → 없거나 revoked/만료/횟수초과 → 410/403 + 감사.
  2. `granteeCompanyId`가 지정돼 있으면 readerCompanyId 일치 필요(무인증 열람이면 지정회사 grant는 거부 — 지정 회사가 로그인 콘솔에서 열람). 미지정 링크는 정책상 금지(기본 지정필수).
  3. 트랜잭션으로 `usedCount++`(상한 재확인).
  4. certId로 스냅샷 로드 → `grant.fields` 화이트리스트로 프로젝션(그 외 필드 제거). 원문 PII는 vault 복호 없이 마스킹 유지(항목에 이름 포함 시 정책 결정 — 아래 D).
  5. `writeAudit({ action:'cert_view', meta:{ grantId, certId, readerCompanyId } })`.
- app/v/page.jsx·app/api/v1/cert GET을 grant 소비형으로. 만료/철회/횟수초과 UI 구분.

## 4. 본인 제출 흐름 (§7 8단계)

현재 흐름:
- "동의 및 내 상태 보내기"(/consent): 동의 완료 시 `completeConsent`가 자동으로 `submitCertificate`(providerCode 회사에 귀속). → **여기서 grant도 자동 생성**(granteeCompanyId=그 회사, 기본값 fields·7일·유한횟수).
- "내 상태 보기"(/go, TrustSendFlow): 본인확인→preview→submit→링크. → **submit 전에 선택 단계 추가**: 회사(코드 입력) → 공개 항목 → 기간 → (횟수). 그 선택으로 grant 생성, 링크=grantId.

신규 API: `POST /api/v1/grant` (requireVerifiedSubject 토큰-only) `{ certId, granteeCode, fields[], expiresInDays, maxUses }` → grant 생성, `{ grantId, shareUrl }` 반환. certId는 본인 것이어야(토큰 subjectUserId===cert.subjectUserId) — 아니면 403.

## 5. 본인 철회 + 내가 보낸 링크

- `GET /api/v1/grant` (토큰-only): 내가(subjectUserId) 만든 grant 목록(granteeCompany·상태·usedCount·만료).
- `POST /api/v1/grant/revoke` (토큰-only) `{ grantId }` → 본인 소유 확인 후 `revokedAt` 설정 + 감사. 이후 열람 차단.
- 클라: /go 완료 화면 또는 신규 "내 링크 관리"에서 목록·철회.

## 6. 기본값 (§7)

지정회사만 · 유효기간 7일 · 재공유 금지 · 원문최소(fields 최소셋) · 만료후 자동차단 · maxUses 유한.

## 7. §14③ 자동화 (vitest 확장)

`tests/phase4-grant.test.js`:
- 본인이 A증명을 B에 grant → B(companyId) `canReadTransaction`/consumeGrant 성공, **fields 밖 항목 미노출**.
- 기간 경과(expiresAt 과거) → 403/410, C(제3회사) → 403.
- maxUses 초과 → 차단. revoke 후 → 차단. 각 열람 `cert_view` 감사 기록.
- grant 없는 B의 직접 조회 → 여전히 403(Phase 2 유지).

## 8. 수용 기준

1. build + `npm test`(신규 grant 테스트 포함) 통과, 데모 3동선 green(동의 자동귀속이 grant 생성 경유로도 동작).
2. `hasValidConsentGrant`가 실제 grant를 검사(스텁 아님). 유효 grant 보유 B만 열람, 항목·기간·횟수·철회 강제.
3. 링크 열람이 usedCount 증가·만료·철회·횟수초과를 트랜잭션으로 강제하고 매 열람 감사.
4. 본인이 grant 생성·조회·철회 가능(토큰-only, 남의 cert엔 grant 불가).
5. Phase 0~3 회귀 없음(오라클 차단·토큰-only·암호화·마스킹·상관ID 미노출·vitest 유지).

## 9. 결정 필요 (착수 전)

| # | 결정 | 권장 |
|---|---|---|
| F1 | 지정회사 미로그인 열람 | 지정회사는 **콘솔 로그인 후** 열람(하드 통제) vs 무인증 링크+수신코드 확인. **권장: 콘솔 로그인**(재공유 방지 확실) |
| F2 | fields에 이름 포함 허용 | 기본 원문최소(이름 미포함, 마스킹) vs 본인이 이름 공개 선택 시 vault 복호 노출. **권장: 본인 선택 시만** |
| F3 | 기존 `/consent` 자동귀속 grant 기본값 | fields·기간·횟수 기본셋 확정 |

---

## 10. 유의

- Phase 4 완료 = §14③(본인 제출·기간·항목·로깅) 달성. 남은 오픈 조건: 실 IdV(D2)·P5(불변감사)·P6(관리자).
- certificate는 불변 스냅샷 유지(수정 금지) — 열람권한만 grant로 가변. 이 분리를 깨지 말 것(P5 불변감사 토대).
