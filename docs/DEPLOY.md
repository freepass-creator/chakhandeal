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
| `MATCH_HMAC_SECRET` | 충분히 긴 랜덤 문자열 | 이름+생년월일 HMAC 매칭키 (미설정 시 폴백+경고) |
| `ALLOW_DEMO_LOGIN` | `1` | 데모 계정(test@/pet@) 로그인 — 운영 전환 시 제거 |
| `GEMINI_API_KEY` | (로컬 .env.local 값) | 신분증/사업자 OCR |

   `ALLOW_PUBLIC_CHECK` 는 현재 손님·콘솔 동선에서 쓰지 않으므로 불필요.
3. Deploy → `https://chakhandeal.vercel.app` (또는 자동 도메인)

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
