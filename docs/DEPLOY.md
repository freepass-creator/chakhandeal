# 배포 · 시연 가이드 — 착한거래 (chakhandeal)

버전: 1.0 · 2026-08-03

## A. 즉석 실폰 시연 — HTTPS 터널 (권장: 오늘 당장 보여줄 때)

실폰 카메라(신분증·얼굴 촬영)는 **HTTPS가 아니면 브라우저가 차단**한다.
`http://IP:3000` 로는 카메라 시연이 안 되므로 터널을 쓴다.

```powershell
# 1) 로컬 서버 (이미 떠 있으면 생략)
cd D:\dev\chakhandeal ; npm run dev

# 2) HTTPS 터널 (cloudflared — 계정·로그인 불필요)
cloudflared tunnel --url http://localhost:3000
# → 출력되는 https://xxxx.trycloudflare.com 을 폰에서 열기
```

- 터널 URL은 실행할 때마다 바뀌는 임시 주소. 시연 끝나면 창을 닫는다(Ctrl+C).
- 로컬 단일 프로세스라 mock 스토어가 공유됨 → 동의→검증 수신 흐름이 안정적으로 재현된다.
- 카톡 상태링크(/v)도 터널 URL 기준으로 만들어져 상대 폰에서 열린다.

## B. 정식 배포 — Vercel (GitHub 연동)

1. vercel.com → Add New Project → `freepass-creator/chakhandeal` import (설정 기본값 그대로, Next.js 자동 인식)
2. Environment Variables 입력:

| 키 | 값 | 용도 |
|---|---|---|
| `SESSION_SIGNING_SECRET` | 랜덤 32바이트 hex | 세션 토큰 서명키 — **미설정+DEMO끔이면 기동 실패**. MATCH와 다른 값 |
| `MATCH_HMAC_SECRET` | 랜덤 32바이트 hex(다른 값) | 이름+생년월일 매칭키 |
| `GEMINI_API_KEY` | (로컬 .env.local 값) | 신분증/사업자 OCR |
| `NEXT_PUBLIC_DEMO_MODE` | `true`(데모 배포) 또는 `false`(운영) | 아래 경고 참조 |

   랜덤 생성: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (두 번 돌려 서로 다른 값).
   `ALLOW_PUBLIC_CHECK`·`ALLOW_DEMO_LOGIN` 은 현재 동선에서 불필요.
3. Deploy → `https://chakhandeal.vercel.app` (또는 자동 도메인)

### ⚠️ 배포 전 보안 게이트 (2026-08-03 전수조사 반영)

- **데모 배포**(`NEXT_PUBLIC_DEMO_MODE=true` 또는 미설정): 가공 씨앗 데이터만. **실인물을 입력하지 말 것**(mock은 인스턴스별 메모리라 유실·비공유 + 무인증 조회 표면이 열림). 세션 서명키가 부팅마다 랜덤이라 토큰 위조는 차단됨.
- **운영 배포**(`NEXT_PUBLIC_DEMO_MODE=false`): SESSION_SIGNING_SECRET·MATCH_HMAC_SECRET·FIREBASE_ADMIN_JSON 셋 다 필수(하나라도 없으면 관련 API가 기동 실패로 fail-closed). 이 모드로 실서비스를 열기 전, **아래 '운영 전 필수 하드닝'을 먼저 끝낼 것**.

### 운영 전 필수 하드닝 (미완료 — 실서비스 오픈 블로커)

전수조사에서 확인된, 코드 수정이 남은 항목:
- 본인확인 세션 바인딩: `/api/v1/consent`가 실제 본인확인을 검증하도록(현재 `identityVerified:true` 하드코딩). preview·submit은 운영에서 이미 403으로 잠갔으나 consent 본선은 미완.
- 테넌트 격리: 콘솔 스코프 키를 상호명·4자리코드 대신 불변 memberId(uid)로. 코드 발급 유니크 검사. `/api/v1/consents` 응답 필드 화이트리스트(photos·matchKey·verified.birth 제외).
- Firestore 규칙: `members` self-create에서 role/status/code 필드 고정, 서버는 custom claim으로만 admin 판정(`session.js` 이메일 하드코딩·fail-open 기본값 제거).

### ⚠️ Vercel 시연 전 반드시 알 것 — mock 스토어는 서버리스에서 공유 안 됨

Firebase Admin 미설정이면 데이터가 **함수 인스턴스 메모리**에만 있다.
Vercel 서버리스는 인스턴스가 여러 개 뜨거나 재활용되므로,
**동의를 제출했는데 콘솔 검증 수신에 안 보이는 상황**이 시연 중 발생할 수 있다.

Vercel에서 신뢰성 있게 시연하려면 Firebase Admin을 설정한다:

| 키 | 값 |
|---|---|
| `FIREBASE_ADMIN_JSON` | Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 → JSON 전체를 한 줄로 |
| `NEXT_PUBLIC_FB_*` 6종 | Firebase 웹앱 구성값 (.env.local.example 참고) |

당장 Firebase 없이 보여줘야 하면 **A안(터널)** 이 안전하다.

## 운영 전환 시 (시연 종료 후)

- `lib/constants.js` `DEMO_MODE = false` — 데모 UI·샘플 통과 전체 제거
- `ALLOW_DEMO_LOGIN` env 제거
- `MATCH_HMAC_SECRET` 실키 필수 (DEMO 끄면 미설정 시 기동 실패)
- Firebase rules 배포: `firestore.rules` · `storage.rules`
