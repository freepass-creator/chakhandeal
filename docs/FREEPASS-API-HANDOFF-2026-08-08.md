# 프리패스 ← 착한거래 API 핸드오프 (패널 ③·④)

작성: Cursor, 2026-08-08  
대상: `C:\dev\freepasserp4` · 착한거래 브랜치 `cursor/freepass-esign-issue-20260808`

사장님 확정: **자동 발송(SMS/알림톡) 없음. 링크 복사→붙여넣기.**  
`POST …/send` 는 **호출하지 말 것**(아직 없음·이번 범위 밖).

---

## 패널 매핑

| 프리패스 | 역할 | 착한거래 API |
|---|---|---|
| ① 목록 | 약정 확정 계약 고르기 | (프리패스 로컬) |
| ② 프리패스 데이터 | 손님에게 나갈 값 미리보기 | (프리패스 `buildConsentGroups`) |
| **③ 착한거래 연동** | 계약서 만들기 + **링크 복사** | `POST /issue` → **`signUrl`** |
| **④ 진행단계** | 어디까지·서류 제출 | `GET /contract/{id}` 폴링 |

---

## 인증

```
Authorization: ApiKey <CHAKHANDEAL_API_KEY>
```

착한거래 `.env.local`:

```
DEMO_MEMBER_API_KEYS=freepass:<CHAKHANDEAL_API_KEY와 동일 값>
```

---

## 1) 계약서 만들기 — 패널 ③

```
POST /api/v1/contract/issue
Idempotency-Key: freepass:{contract_code}:issue
```

요청 본문은 이미 `chakhandealIssuePayload` 형태.  
응답:

```jsonc
{
  "contractId": "chd_…",
  "signUrl":    "https://…/consent?c=chd_…",  // ← 복사할 링크 (필수 저장)
  "expiresAt":  1755…,
  "verifyUrl":  "",   // 서명 전엔 빈 문자열 — 복사 링크로 쓰지 말 것
  "sealHash":   ""
}
```

### 프리패스 저장 필드 (고칠 것)

지금 `issueChakhandealContract` / `send` 라우트가 **`verifyUrl`만** 넣고 `signUrl`을 버림.  
패널 ③ 복사는 `esign_verify_url`을 쓰는데, 서명 전 `verifyUrl`은 비어 있어서 링크가 안 남는다.

권장 매핑:

| 착한거래 | 프리패스 필드 |
|---|---|
| `contractId` | `esign_id` |
| **`signUrl`** | **`esign_verify_url`** (이름 레거시지만 **서명 링크**로 사용) 또는 `esign_sign_url` 신설 |
| `sealHash` | `esign_seal_hash` |
| `expiresAt` | `sign_expires_at` |
| — | `sign_sent_at` = 만든 시각, `sign_status` = `'발행'` (발송 API 호출 없이) |

**`sendChakhandealContract` 호출 제거.**  
「계약서 만들기」= `issue`만. 만든 뒤 패널 ③에서 `signUrl` 복사.

---

## 2) 진행·첨부 — 패널 ④

```
GET /api/v1/contract/{contractId}
Authorization: ApiKey …
```

응답 요지:

```jsonc
{
  "contractId": "chd_…",
  "externalRef": "TMP-…",
  "status": "issued" | "opened" | "signed" | …,
  "signUrl": "https://…/consent?c=…",
  "agreement": { "title", "version", "isSample" },
  "consentGroups": [ /* 미리보기용, value 재포맷 금지 */ ],
  "consents": {
    "identity_verified": 1754…,  // 본인확인
    "identity": 1754…,
    "vehicle": 1754…,
    "rental": 1754…,
    "insurance": 1754…,
    "documents": 1754…,          // 필수 서류 전부 제출 시
    "agreement": 1754…,
    "signed": 1754…
  },
  "documents": [
    { "key": "family_register", "label": "…", "required": true, "submitted": true, "submittedAt": 1754… }
  ],
  "progress": 3,          // 연속 통과 단계 수 0~8
  "progressTotal": 8,
  "identity": { "verified": true, "hasIdCard": true, "hasSelfie": true, "verifiedAt": … },
  "hasSignature": false,
  "openedAt": …,
  "signedAt": null,
  "expiresAt": …,
  "verifyUrl": "",
  "sealHash": ""
}
```

`consents` 키는 프리패스 `ESIGN_STEPS`와 동일하다 → `sign_consents`에 그대로 넣으면 `esignStage()`가 동작한다.

권장 동기화(새로고침 / 주기 폴링):

| GET 필드 | 프리패스 |
|---|---|
| `consents` | `sign_consents` |
| `progress` | `esign_progress` |
| `openedAt` | `esign_opened_at` |
| `signedAt` | `sign_signed_at` |
| `status==="signed"` | `sign_status='서명완료'` |
| `documents` | UI 첨부 목록 (원본 파일은 아직 미제공) |
| `expiresAt` | `sign_expires_at` |

원본 신분증·셀카·서명·서류 바이너리 / 완성 PDF는 **다음 차수**  
(`GET …/package` 예정). 지금은 제출 여부만.

---

## 3) 하지 말 것

- `POST /api/v1/contract/{id}/send` — 없음. 호출하면 502.
- `verifyUrl`을 손님 링크로 쓰기 — 서명 전 빈 값.
- `rows[].value` 재포맷·빈 보험 칸 `—` 채우기.

---

## 4) 로컬 스모크

착한거래:

```
DEMO_MEMBER_API_KEYS=freepass:dev-key
npm run dev   # :3000
```

프리패스:

```
CHAKHANDEAL_API_BASE_URL=http://localhost:3000
CHAKHANDEAL_API_KEY=dev-key
CHAKHANDEAL_MEMBER_COMPANY=freepass
CHAKHANDEAL_TEMPLATE_ID=tpl_freepass_rental_v1
```

1. 패널 ③ 「계약서 만들기」→ `signUrl` 저장·표시  
2. 「링크 복사」→ 손님 브라우저에서 열기  
3. 패널 ④ 새로고침 → `consents` / `progress` 반영  

---

## 5) 착한거래에 이미 있는 것

- [x] `POST /api/v1/contract/issue` (+ 멱등 `externalRef`)
- [x] `GET /api/v1/contract/{id}` (signUrl·progress·documents 메타)
- [x] `/consent?c=` 손님 여정 (본인확인→그룹→서류→약관→서명)
- [x] 서명·서류·신분증 경로 영속 저장
- [ ] SMS/알림톡 발송
- [ ] 웹훅
- [ ] 완성 PDF(본문+신분증+셀카+서명+서류)
