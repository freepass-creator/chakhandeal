# Firebase 프로젝트 만들기 — 착한거래

작성: 2026-08-08 · **프리패스(freepasserp4)와 별개 프로젝트다.** 같은 프로젝트에 얹지 않는다.

> ⚠ **리전은 프로젝트를 만들 때 정해지고 나중에 못 바꾼다.**
> 계약서 「01 계약자 정보」가 주민등록번호·면허번호·주소를 요구하고 착한거래가 이를 받기로 했으므로
> (2026-08-08 결정), **반드시 `asia-northeast3`(서울)** 로 만든다.
> 잘못 만들면 프로젝트를 새로 파고 이관해야 한다.

---

## 1. 프로젝트 생성

1. [console.firebase.google.com](https://console.firebase.google.com) → **프로젝트 추가**
2. 이름: `chakhandeal` (또는 `chakhandeal-prod`)
3. Google 애널리틱스: **사용 안 함** (개인정보 최소화)

## 2. Firestore — 서울

**빌드 → Firestore Database → 데이터베이스 만들기**

| 항목 | 값 |
|---|---|
| 위치 | **`asia-northeast3` (서울)** ← 변경 불가 |
| 모드 | **프로덕션 모드**로 시작 (테스트 모드는 30일 뒤 전체 공개가 된다) |

만든 뒤 `firestore.rules` 를 배포한다(리포에 있음).

## 3. Storage — 서울

**빌드 → Storage → 시작하기**

| 항목 | 값 |
|---|---|
| 위치 | **`asia-northeast3` (서울)** |
| 규칙 | 프로덕션 모드 |

신분증·셀피·서명·제출서류가 여기 들어간다. **공개 URL을 만들지 않는다** — 서버가 경로만 들고 있고
당사자(본인 + 발행 회원사)에게만 서명된 URL로 내준다.

## 4. Authentication

**빌드 → Authentication → 시작하기** → 이메일/비밀번호 사용 설정

> Firebase Authentication 은 **리전을 고를 수 없고 구글이 미국에서 처리한다.**
> 담기는 것은 이메일·연락처·UID 뿐이고 **주민번호는 Firestore(서울) `pii_vault` 에 들어간다.**
> → 개인정보 처리방침에 「인증 정보는 Google Firebase Authentication 을 통해 미국에서 처리됨」을 적는다.

## 5. 서비스계정 키

**⚙ 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성** → JSON 다운로드

- **이 파일을 채팅·메일·리포에 올리지 않는다.** 한 번 노출되면 재발급해야 한다
- `.env.local` 에 한 줄로 넣거나(`FIREBASE_ADMIN_JSON`), 파일 경로로 준다(`FIREBASE_ADMIN_PATH`)
- `.gitignore` 에 `.env.local` 과 `service-account.json` 이 걸려 있는지 확인

## 6. 웹 앱 등록

**⚙ 프로젝트 설정 → 내 앱 → 웹(</>) 추가** → 표시되는 config 값을 `.env.local` 에 옮긴다.

---

## 7. `.env.local` 채우기

`.env.local.example` 을 복사해 만든다. **시크릿 6개는 각각 다른 랜덤값**이어야 한다.

```powershell
Copy-Item .env.local.example .env.local
# 랜덤 32바이트 hex 6개 생성
1..6 | ForEach-Object { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" }
```

| 키 | 채우는 값 |
|---|---|
| `MATCH_HMAC_SECRET` | 랜덤 ① |
| `SESSION_SIGNING_SECRET` | 랜덤 ② |
| `IDENTITY_SIGNING_SECRET` | 랜덤 ③ |
| `PII_KEK` | 랜덤 ④ — **주민번호 봉투암호화 키. 잃어버리면 복호 불가** |
| `PHONE_LOOKUP_SECRET` | 랜덤 ⑤ |
| `COMPANY_TOKEN_SECRET` | 랜덤 ⑥ |
| `FIREBASE_ADMIN_JSON` | 5번 서비스계정 JSON 한 줄 |
| `NEXT_PUBLIC_FB_*` | 6번 웹 config |
| `GEMINI_API_KEY` | OCR용 |

> **`PII_KEK` 는 별도 백업**해 둔다. 이 값이 없으면 저장된 주민번호·이름·주소를 영영 못 읽는다.
> 운영 전환 시에는 Cloud KMS 로 옮기는 것이 목표다(`SECURITY-DESIGN.md` D4).

## 8. 연결 확인

```powershell
npm run dev
# /labs/esign 에서 서명까지 진행 → 완료 화면의 「계약서 저장」이
#   store: "firestore" · path: "lab_contracts/chd_…" 로 나오면 연결됨
#   store: "file" 이면 아직 자격이 안 잡힌 것
```

---

## 9. 배포 리전 — Vercel

`vercel.json` 에 `regions: ["icn1"]`(서울)이 들어 있다. **지우지 말 것.**
지우면 기본값(미국 버지니아)으로 배포되어 Firestore 가 서울이어도 **신분증이 미국 서버를 거친다.**
자세한 것은 `DEPLOY.md` §A-2.

## 10. 보관·파기

| 데이터 | 보관기간 |
|---|---|
| 계약 데이터 · 주민등록번호 | 계약기간 중 + **계약 종료 후 5년**(국세기본법 §85의3 — 세금계산서 증빙 보존) |
| 신분증·셀피 촬영본 | 본인확인 목적 달성 후 — **기간 확정 필요** |

수집 근거가 「부가가치세법 §32② 세금계산서 발행」이므로 **증빙 보존기간이 곧 주민번호 보유기간**이다.

- 동의서 문구를 **「계약 종료 후 5년」처럼 숫자로** 적는다. JPK 엑셀의 「계약종료일까지」는 옛 문구라
  실제 보관기간과 어긋난다(프리패스 `consentAtoms` 는 「관계 법령이 정한 기간까지」로 이미 맞다).
- **파기 경로가 아직 없다.** `pii_vault` 에 `purgeAt` 을 두고 만료분을 지우는 배치가 필요하다.
  지금은 넣기만 하고 지우는 코드가 없다.
