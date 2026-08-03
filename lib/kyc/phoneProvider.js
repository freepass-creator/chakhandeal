// 휴대폰 본인인증 프로바이더 stub — 의도적 보류. PASS/통신사 실연동은 담당자 예정 (docs/INTEGRATIONS.md).
// 현재: 데모용 any-6-digit 통과. DEMO_MODE 동작은 변경하지 말 것.

export async function requestPhoneCode({ phone, name, birth, carrier }) {
  // 실연동 시: 벤더 API 호출 후 txId 반환
  return {
    ok: true,
    mock: true,
    txId: `mock_${Date.now()}`,
    message: "인증번호를 발송했습니다.",
    phone,
    name,
    birth,
    carrier,
  };
}

export async function verifyPhoneCode({ txId, code }) {
  const c = String(code || "").replace(/\D/g, "") || "000000";
  return { ok: true, mock: true, txId: txId || null, code: c };
}
