// 휴대폰 본인인증 프로바이더 stub — 나중에 PASS/통신사 구현체로 교체.
// 현재: 데모용 any-6-digit 통과.

export async function requestPhoneCode({ phone, name, birth, carrier }) {
  // 실연동 시: 벤더 API 호출 후 txId 반환
  return {
    ok: true,
    mock: true,
    txId: `mock_${Date.now()}`,
    message: "연동 예정 — 데모에서는 아무 6자리나 입력하면 통과됩니다.",
    phone,
    name,
    birth,
    carrier,
  };
}

export async function verifyPhoneCode({ txId, code }) {
  const c = String(code || "").replace(/\D/g, "");
  if (c.length !== 6) {
    return { ok: false, error: "인증번호 6자리를 입력해 주세요." };
  }
  // 실연동 시: 벤더 검증. 데모는 모든 6자리 수락.
  return { ok: true, mock: true, txId: txId || null };
}
