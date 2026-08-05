# 전자계약 스캐폴드 (틀)

버전 0.1 · 착한거래 동의 흐름에 **읽고 동의** 전자계약 자리를 얹는 틀만.

## 목표

- **기본**은 기존 「착한거래 동의」(개인정보 제3자 제공 + 상태 검증 전달).
- **전자계약**인 경우: 계약서를 **읽고** 동의한 뒤에만 서명·제출 진행.
- **업종별** 기본 계약서(rent / pet / dine / stay) + **커스터마이징** 계약서 자리.
- Phase 4 `consent_grant`(열람권한)와는 별개. 외부 전자서명 벤더·PDF·법적 효력은 이후.

## 모드

| `agreement` | 의미 | 손님 UX |
|---|---|---|
| *(없음)* / `platform_consent` | 착한거래 동의 | 기존 `ConsentClauses` + 체크 |
| `e_contract` | 전자계약 | `ContractReader` 열람 게이트 → 동의 → (이어서) 착한거래 동의 조항 → 서명 |

## 링크

```
/consent?code=1001
/consent?code=1001&agreement=e_contract
/consent?code=1001&agreement=e_contract&contract=tpl_rent_rental_v1
/consent?code=1001&agreement=e_contract&contract=tpl_custom_demo_rent_v1
```

`contract` 생략 시: 해당 코드 커스텀이 있으면 우선, 없으면 업종 기본 템플릿.

## API

`GET /api/v1/contracts?vertical=&code=` — 선택 목록  
`GET /api/v1/contracts?agreement=e_contract&contract=&vertical=&code=` — 단일 해석

## 모델(기록, additive)

동의 완료 문서에 선택적으로:

```
agreementKind: "platform_consent" | "e_contract"
contract: { id, title, version, source, vertical, readThrough: true }
```

## 콘솔

안내·동의 탭에서 모드(착한거래 동의 / 전자계약)와 템플릿을 고르고 링크를 복사·공유.  
커스텀 본문 편집 UI·저장 API는 이후(현재는 데모 커스텀 템플릿 + mock Map).

## Out of scope (이번 틀)

- 전자서명 사업자 연동, PDF/DOCX 업로드, 법적 타임스탬프
- 양측 서명·회신 인박스
- Phase 4 열람권한(`consent_grant`)
