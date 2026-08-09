# A4 계약서 규격

서명이 끝난 계약을 «종이와 같은 계약서»로 내주기 위한 규격. 값이 아직 안 채워져도
이 규격이 먼저 서 있어야, 나중에 값을 붙이는 일이 데이터 문제로만 남는다.

---

## 1. 무엇이 정본인가

| 층 | 무엇 | 어디 |
|---|---|---|
| 원자 | 서명 시점에 굳은 값. 봉인 해시의 대상 | Firestore `contract_instances/{id}.atoms` |
| 서식 | A4 칸이 어디에 있는지 | `public/contract-template/*.html` |
| 칸 명세 | 각 칸을 «누가 무엇으로» 채우는지 | `spec/{회원사}.{서식}.field-map.json` |
| 규격 | 위 둘을 대조한 결과 | `lib/server/templateSlots.json` (생성물) |

**계약서는 새로 계산하지 않는다.** 서명 시점에 굳은 값을 서식에 주입할 뿐이다.
다시 계산하면 「손님이 서명한 그 문서」가 아니게 된다.

---

## 2. 지금 규격

`node scripts/template-slots.mjs` 로 생성. 서식을 고치면 다시 돌린다.

| 서식 | A4 | 칸 | 출처 미정 | 헛도는 명세 |
|---|---:|---:|---:|---:|
| `rental-contract.html` | 14장 | 142 | 1 | 0 |
| `contract-individual.html` | 8장 | 141 | 141 | 0 |
| `contract-guarantor.html` | 3장 | 21 | 21 | 0 |

- **출처 미정** = 서식에는 칸이 있는데 채울 사람이 정해지지 않았다 → **빈칸으로 인쇄된다**
- **헛도는 명세** = 명세에는 있는데 서식에 칸이 없다 → 보내도 아무 데도 안 들어간다

`rental-contract.html` 은 141/142 가 명세와 맞물려 있다. 나머지 두 서식은 명세가 아직 없다
(칸은 다 파악돼 있으므로, 명세 파일만 만들면 바로 맞물린다).

### 계약 유형 → 서식

| `templateId` | 서식 |
|---|---|
| `rent_buyout` · `rent_return` | `rental-contract.html` |
| `individual` | `contract-individual.html` |
| `guarantor` | `contract-guarantor.html` |
| 그 밖 / 빈값 | `rental-contract.html` |

---

## 3. 회원사가 보내는 것 — `templateFields`

계약 발행(`POST /api/v1/contract/issue`) 때 함께 보낸다.

```jsonc
{
  "templateId": "rent_buyout",
  "externalRef": "…",
  "signer": { "name": "…", "birth": "…", "phone": "…" },

  // 손님 «화면»용 — 읽기 좋게 끊은 것
  "consentPages": [ … ],
  "inputGroups":  [ … ],

  // 계약서 «인쇄»용 — 서식의 data-field 이름 그대로
  "templateFields": {
    "contract_code": "…",
    "car_number":    "12가1234",
    "rent_amount":   "1,000,000",
    "co":            "sonogong",   // 서식 안의 분기 선택도 여기 넣는다
    "ins":           "포함"
  }
}
```

**화면용과 인쇄용을 왜 따로 받나.**
화면은 손님이 읽기 좋게 끊은 것이고, 인쇄본은 계약서 서식의 정해진 칸이다.
화면 값에서 인쇄본을 되짚어 만들면 칸이 어긋나고 빈칸이 생긴다.
법적으로 쓰는 문서에서 빈칸은 그냥 흠이다.

**값은 «표시될 문자열 그대로»** 보낸다. 착한거래가 다시 포맷하지 않는다 —
그러면 화면에 보인 숫자와 계약서의 숫자가 갈릴 수 있다.

### 프리패스는 이미 이 모양을 만들고 있다

`freepasserp4` 의 `buildContractPayload(contractCode)` 반환값 `payload` 가 바로 이 형태다
(`lib/domain/contract-send.ts`). 발행 호출에 그대로 얹으면 된다.

### 손님이 계약 중에 채우는 칸

주소·계좌처럼 계약 진행 중에 받는 값은 발행 시점에 없다.
착한거래가 받아서 `atoms.inputs` 에 넣고, 인쇄할 때 `templateFields` 위에 덮어쓴다.
→ `inputGroups[].fields[].key` 를 **서식의 `data-field` 이름과 같게** 두면 자동으로 맞물린다.

---

## 4. 인쇄본이 만들어지는 경로

```
POST /api/v1/contract/{id}/document     본인확인 토큰 또는 회원사 ApiKey
      → 10분짜리 열람표(HMAC)
GET  /api/v1/contract/{id}/document?t=… 표 확인 → A4 HTML
      → 브라우저 인쇄 → PDF로 저장
```

**서버에서 PDF 를 만들지 않는 이유.** 한글 PDF 는 폰트를 통째로 실어야 해서 서버리스에
무겁고, 자간·줄바꿈이 브라우저와 달라진다. 브라우저 인쇄가 같은 A4 규격을 더 정확한
글자로 낸다. 인쇄 설정은 **용지 A4 · 여백 없음**.

### 지켜야 하는 것

- **봉인본은 `localStorage` 를 읽지도 쓰지도 않는다.**
  원본 서식은 초안을 복원하는데, 그대로 두면 ① 이 기기에서 쓰던 *다른 계약* 값이
  서명된 문서에 섞이고 ② 손님 기기에 이름·계좌가 평문으로 남는다.
  (`rental-contract.html` 의 `SEALED` 분기)
- **서명 이미지에 공개 URL 을 만들지 않는다.** 서버가 바이트를 읽어 문서에 직접 넣는다.
- **응답은 `no-store` · `noindex` · `no-referrer`.**
- **착한거래 BI/CI 를 넣지 않는다.** 계약 당사자는 회원사와 손님이다.

---

## 5. 서식을 새로 붙일 때

1. `public/contract-template/` 에 A4 서식 HTML 을 넣는다 (210×297mm, `@page{size:A4}`)
2. 서식이 `window.Contract.setData(obj)` 를 노출하게 한다 (`data-field` 치환)
3. 봉인 분기를 넣는다 — `window.__SEALED__` 가 있으면 초안 복원·저장을 건너뛴다
4. `lib/server/contractDocument.js` 의 `TEMPLATES` 에 `templateId` 를 등록한다
5. `spec/{회원사}.{서식}.field-map.json` 에 칸 명세를 넣는다
6. `node scripts/template-slots.mjs` — **출처 미정 0** 이 될 때까지 채운다

`node scripts/template-slots.mjs --check` 는 서식과 규격이 어긋나면 실패한다.
