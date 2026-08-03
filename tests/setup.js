// 테스트 공통 시크릿 — 데모 폴백과 분리해 matchKey·토큰이 안정적으로 재현되게
process.env.MATCH_HMAC_SECRET = process.env.MATCH_HMAC_SECRET || "test-match-hmac-secret-32chars!!";
process.env.SESSION_SIGNING_SECRET = process.env.SESSION_SIGNING_SECRET || "test-session-signing-secret-32";
process.env.IDENTITY_SIGNING_SECRET = process.env.IDENTITY_SIGNING_SECRET || "test-identity-signing-secret-32";
process.env.NEXT_PUBLIC_DEMO_MODE = "true";
