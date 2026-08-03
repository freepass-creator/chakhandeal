// 테스트 공통 시크릿 — 데모 폴백과 분리해 matchKey·토큰이 안정적으로 재현되게
process.env.MATCH_HMAC_SECRET = process.env.MATCH_HMAC_SECRET || "test-match-hmac-secret-32chars!!";
process.env.SESSION_SIGNING_SECRET = process.env.SESSION_SIGNING_SECRET || "test-session-signing-secret-32";
process.env.IDENTITY_SIGNING_SECRET = process.env.IDENTITY_SIGNING_SECRET || "test-identity-signing-secret-32";
process.env.PII_KEK = process.env.PII_KEK || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.PII_KEK_VERSION = process.env.PII_KEK_VERSION || "test-v1";
process.env.PHONE_LOOKUP_SECRET = process.env.PHONE_LOOKUP_SECRET || "test-phone-lookup-secret-32ch";
process.env.COMPANY_TOKEN_SECRET = process.env.COMPANY_TOKEN_SECRET || "test-company-token-secret-32ch";
process.env.NEXT_PUBLIC_DEMO_MODE = "true";
