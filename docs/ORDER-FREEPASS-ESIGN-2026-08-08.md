# 오더 — 프리패스 전자계약 연동 (링크 발급까지)

작성: Claude, 2026-08-08 · 구현: Cursor · 대상 리포: `C:\dev\chakhandeal`
회원사 쪽 문서: `C:\dev\freepasserp4\docs\ESIGN_CHAKHANDEAL_INTEGRATION.md`
기존 요청서 `docs/MEMBER-ESIGN-REQUEST.md` 의 **범위 축소판**이다 — 이 문서가 우선한다.

---

## 0. 이번 범위 — «링크가 나가는 데까지»

사장님 결정(2026-08-08): **SMS 자동발송을 쓰지 않는다. 관리자가 링크를 복사해 손님에게 보낸다.**
그래서 이번에 만들 것은 넷뿐이다.

| # | 항목 | 왜 필수인가 |
|---|---|---|
| 1 | **계약 인스턴스 저장(영속)** | 지금 담을 자리가 없다 — §1 |
| 2 | **`POST /api/v1/contract/issue`** | 프리패스가 계약 데이터를 밀어 넣는 입구 |
| 3 | **`/consent?c={contractId}` 인스턴스 렌더** | 손님이 «내 계약»을 보는 화면 |
| 4 | **M2M 인증(API Key)** | 없으면 아무나 남의 이름으로 계약을 발행한다 |

**이번에 안 만드는 것**(뒤로 미룸): SMS 발송 API · 웹훅 · 실 IdV(얼굴대조) · 문서 해시 봉인.

> ⚠ 단 **서명 이미지 저장은 §6 에서 반드시 같이 고친다.** 지금 서명 PNG 를 버리고 불리언만 남기는데
> (`app/consent/page.jsx:200` `signed: !!(sig || DEMO_MODE)`), 그 상태로 손님 서명을 받으면
> «서명받았다는 기록»이 남지 않는다. 링크만 나가고 서명은 못 받는 반쪽이 된다.

---

## 1. 지금 왜 안 되는가 — 사실 확인

`lib/server/contracts.js` 가 하는 일은 **템플릿 조회뿐**이다.

```js
resolveContractTemplate({ contractId }) → { title, sections: [{ t, b }] }
```

`sections` 는 `"제1조 (목적) — 본 계약은 대여인(회원사)과 차주인 사이의…"` 같은 **고정 문구**다.
차량번호·월대여료가 들어갈 슬롯이 없다. → **손님별 계약 데이터를 담을 자리가 없다.**

그리고 저장소가 메모리다.

```js
function store() {
  if (!globalThis.__rsProStore) globalThis.__rsProStore = {};   // ← 서버 재시작하면 소멸
```

`/consent?code=1001` 의 `code` 는 **회원사 코드**라 «이 회사의 표준 계약서»만 열린다.
«홍길동님의 계약»을 가리키는 링크가 없다.

---

## 2. 계약 인스턴스 — 저장 스키마

템플릿(조항 문구)과 **인스턴스(이 손님의 이 계약)** 를 분리한다. 인스턴스는 **영속 저장소**에 넣는다
(`globalThis` 금지 — 링크가 며칠 살아 있어야 한다).

```jsonc
contractInstance {
  contractId:    "chd_9f3a…",          // 우리가 발급, URL-safe, 추측 불가(≥128bit 랜덤)
  memberCompany: "freepass",           // 발행한 회원사
  externalRef:   "TMP-260808-01",      // 회원사 계약번호 — 재발행 멱등키
  status:        "issued",             // issued | opened | signed | rejected | expired
  signer:        { name, phone, birth },
  consentGroups: [...],                // §3 — 손님 화면 그 자체
  requiredDocs:  [...],
  agreement:     { version, title, sections, confirmLabel, requireReadThrough, isSample },
  data:          {...},                // 기계용 원본값
  // 손님이 채우는 것
  consents:      { identity: 1754…, vehicle: 1754…, rental: 1754…, insurance: 1754…, agreement: 1754… },
  documents:     [{ key, storagePath, submittedAt, sha256 }],
  identity:      { idCardPath, selfiePath, verifiedAt, method },
  signaturePath: "…/sig.png",
  signedAt:      1754…,
  issuedAt:      1754…,
  expiresAt:     1754…                 // 기본 발행 후 14일
}
```

**`contractId` 는 반드시 추측 불가여야 한다.** 이 링크 하나가 손님 개인정보와 서명 화면을 연다.
연번·짧은 코드 금지. `/consent?code=1001` 의 4자리 코드 방식을 여기에 쓰지 말 것.

---

## 3. `POST /api/v1/contract/issue`

```
Authorization: ApiKey <회원사 키>
Idempotency-Key: freepass:TMP-260808-01:issue
Content-Type: application/json
```

요청 본문은 **프리패스가 이미 이 모양으로 보내고 있다**(`lib/domain/chakhandeal-esign.ts`).
추측하지 말고 그대로 받으면 된다. 실물 예시:

```jsonc
{
  "consentGroups": [
    { "key": "identity", "title": "본인정보",
      "note": "아래 정보로 계약이 작성됩니다. 다르면 서명하지 말고 담당자에게 알려 주세요.",
      "rows": [
        { "label": "성명",   "value": "홍길동",         "raw": "홍길동" },
        { "label": "연락처", "value": "010-1234-5678",  "raw": "01012345678" },
        { "label": "생년월일","value": "1988-03-12",    "raw": "1988-03-12" },
        { "label": "주소",   "value": "서울시 강남구 테헤란로 123", "raw": "…" }
      ],
      "confirmLabel": "위 본인정보가 정확함을 확인합니다", "required": true },

    { "key": "vehicle",   "title": "차량정보", "rows": [ { "label": "차량번호", "value": "12가3456" }, … ],
      "confirmLabel": "위 차량으로 계약함을 확인합니다", "required": true },

    { "key": "rental",    "title": "대여조건", "rows": [
        { "label": "대여기간", "value": "36개월" },
        { "label": "월 대여료", "value": "690,000원" },
        { "label": "보증금",   "value": "무보증" },
        { "label": "약정 주행거리", "value": "연 2만km" },
        { "label": "중도해지", "value": "잔여 대여료의 30%" } ],
      "confirmLabel": "위 대여조건에 동의합니다", "required": true },

    { "key": "insurance", "title": "보험", "rows": [
        { "label": "대인 보상한도", "value": "무한" },
        { "label": "대물 보상한도", "value": "2억원" },
        { "label": "자차 최소 면책금", "value": "30만원" }, … ],
      "confirmLabel": "위 보험 조건을 확인했습니다", "required": true }
  ],

  "requiredDocs": [
    { "key": "family_register",  "label": "가족관계증명서", "note": "주민번호 뒷자리는 가려서 촬영해 주세요.", "required": true },
    { "key": "resident_register","label": "주민등록등본",   "note": "최근 3개월 이내 발급본.", "required": true },
    { "key": "bank_book",        "label": "통장 사본",      "note": "자동이체 계좌.", "required": false }
  ],

  "agreement": {
    "version": "sample-v1", "title": "자동차 대여 표준약관 (샘플)",
    "isSample": true, "requireReadThrough": true,
    "confirmLabel": "위 약관을 모두 읽고 이해했으며 이에 동의합니다",
    "sections": [ { "t": "제1조 (목적)", "b": "이 약관은 …" }, … 11개조 ]
  },

  "templateId": "tpl_freepass_rental_v1",
  "memberCompany": "freepass",
  "externalRef": "TMP-260808-01",
  "signer": { "name": "홍길동", "phone": "01012345678", "birth": "1988-03-12" },
  "data": { "contractCode": "…", "carNumber": "…", "rentAmount": 690000, … }
}
```

응답:

```jsonc
{ "contractId": "chd_9f3a…",
  "signUrl":    "https://<착한거래>/consent?c=chd_9f3a…",
  "expiresAt":  1755…,
  "verifyUrl":  "",            // 서명 전이므로 빈 값 — 서명완료 시 발급
  "sealHash":   "" }
```

### 지켜야 할 것

- **`rows[].value` 를 다시 포맷하지 말 것.** 프리패스가 `690,000원`·`36개월`·`010-1234-5678` 까지
  만들어 보낸다. 저쪽에서 다시 만들면 ERP 화면과 계약서의 숫자가 달라 보인다. **그대로 출력한다.**
- **`rows` 에 없는 항목을 채워 넣지 말 것.** 값이 없는 보험 행은 프리패스가 **일부러 뺐다.**
  `—` 로 채우면 손님이 «없는 보장»을 있는 걸로 읽는다.
- `consentGroups` 순서 = 화면 순서다. 재정렬 금지.
- `externalRef` 가 같은 재요청은 **새 계약을 만들지 말고 기존 것을 돌려준다**(멱등).
  프리패스가 `Idempotency-Key` 를 보낸다.
- **`agreement.isSample === true` 면 손님 화면 상단에 «샘플 약관» 배지를 띄운다.**
  법률 검토 전 문구다. 실계약에 쓰이면 사고다 — 눈에 보이게 할 것.

---

## 4. `/consent?c={contractId}` — 손님 화면

기존 `/consent` 의 5단계(`대상 → 본인확인 → 동의 → 서명 → 완료`)를 **인스턴스 모드**로 확장한다.
`?code=`(회원사 코드) 진입은 **그대로 둔다** — 박제 URL 이라 깨면 안 된다(`platform-principles`).

```
?c={contractId} 진입 시

① 본인확인    신분증 촬영 → OCR → 셀피          ← 기존 AuthFlow 재사용
② 본인정보    consentGroups[0] 표 → ☑ confirmLabel
③ 차량정보    consentGroups[1] 표 → ☑
④ 대여조건    consentGroups[2] 표 → ☑
⑤ 보험        consentGroups[3] 표 → ☑
⑥ 서류제출    requiredDocs 촬영 업로드 (required 는 건너뛰기 불가)
⑦ 약관        agreement.sections 통독(스크롤 끝까지) → ☑
⑧ 서명        SignaturePad → 제출
```

- ②~⑤ 는 `consentGroups` 를 **순회해서 그린다.** 묶음 개수를 코드에 박지 말 것 —
  프리패스가 나중에 묶음을 늘리면 그대로 따라와야 한다.
- 각 단계 통과 시각을 `consents[key]` 에 기록한다. **체크만으로 다음 단계로 넘긴다**(서버 저장은 단계마다).
  마지막에 몰아 저장하면 손님이 중간에 이탈했을 때 어디까지 봤는지 못 남긴다.
- ⑦ 은 `requireReadThrough` 가 true 면 **스크롤 하단 도달 전 체크 비활성** — `ContractReader` 에 이미 있다.
- 첫 진입 시 `status` 를 `opened` 로 올린다.
- 만료(`expiresAt` 경과)·이미 `signed` 인 링크는 서명 화면 대신 안내를 띄운다.

---

## 5. M2M 인증

```
Authorization: ApiKey <키>
```

- 회원사별 키. **해시로 저장**(평문 보관 금지). 키 → `memberCompany` 해석.
- `issue` 는 이 인증 없이 **절대** 열지 말 것. 열면 아무나 남의 이름으로 계약을 발행한다.
- 회원사는 **자기가 발행한 인스턴스만** 조회·수정한다(`memberCompany` 대조).
  이건 불변식 2(교차검색 금지)의 연장이다.
- 레이트리밋을 건다(`lib/server/rateLimit.js` 재사용).

---

## 6. 서명 이미지 저장 — 같이 고친다

현재 `app/consent/page.jsx:200`:

```js
signed: !!(sig || DEMO_MODE),      // ← sig(PNG dataURL)를 받아놓고 버린다
```

`SignaturePad` 는 `onChange(dataURL)` 로 PNG 를 정상적으로 넘겨준다(`components/SignaturePad.jsx:32`).
**받는 쪽이 불리언으로 뭉갠다.** 이걸 고치지 않으면 서명 기록이 남지 않는다.

- 서명 PNG · 신분증 · 셀피 · 제출서류를 **파일 저장소에 저장**하고 인스턴스에 경로를 남긴다.
- 이 파일들은 **당사자(본인 + 발행 회원사)만** 접근한다. 공개 URL 금지.
- 증명서(`/v?id=`)에는 **넣지 않는다** — 제3자에게 나가는 건 사실 요약뿐이다(`platform-principles`).

---

## 7. 완료 확인 — 이번엔 웹훅 없이

웹훅은 다음 차수다. 이번에는 조회만 열어 준다.

```
GET /api/v1/contract/{contractId}     Authorization: ApiKey <키>
→ { contractId, externalRef, status, consents, documents:[{key,submittedAt}],
    signedAt, verifyUrl, sealHash }
```

프리패스 관리 화면이 «새로고침»을 누를 때만 부른다(자동 폴링 안 한다).
**서명 이미지·신분증·서류 원본은 이 응답에 넣지 않는다** — 제출 여부와 시각만.

---

## 8. 완료 기준

- [ ] 인스턴스가 **서버 재시작 후에도** 살아 있다(`globalThis` 아님).
- [ ] `issue` 가 API Key 없이 401, 잘못된 키로 401.
- [ ] 같은 `externalRef` 로 두 번 발행 → 같은 `contractId` 반환(새 계약 안 생김).
- [ ] 발급된 `signUrl` 을 **로그아웃 브라우저**에서 열면 ①~⑧ 이 순서대로 나온다.
- [ ] `rows[].value` 가 응답 그대로 출력된다(재포맷·행 추가 없음).
- [ ] `isSample: true` 면 «샘플 약관» 배지가 보인다.
- [ ] 약관을 끝까지 스크롤하기 전에는 동의 체크가 안 눌린다.
- [ ] 서명 후 인스턴스에 **PNG 경로가 남는다**(불리언 아님).
- [ ] 만료된 링크·이미 서명된 링크가 서명 화면을 다시 열지 않는다.
- [ ] `/consent?code=1001` 기존 진입이 그대로 동작한다(회귀 없음).
- [ ] 다른 회원사 키로 남의 `contractId` 조회 시 404/403.

---

## 9. 주의

- 실제 경로는 **`C:\dev\chakhandeal`** — `rentsafe`·`rentsafe-pro` 는 구본이니 손대지 말 것.
- Firebase 프로젝트가 프리패스와 **별개**다.
- 박제 URL `/consent?code=` · `/v?id=` 는 깨지 않는다.
- 본인확인은 아직 스텁이다(`app/api/v1/idv/issue` 가 운영에서 501, `DEMO_MODE` 전용).
  **이번 범위는 «링크 발급까지»이므로 스텁 상태로 붙여도 된다.**
  다만 **실 손님·실데이터 투입은 실 IdV 도입 전까지 금지**다(`docs/SECURITY-DESIGN.md` D2).
  샘플 약관과 스텁 IdV 로는 **테스트만** 한다.
