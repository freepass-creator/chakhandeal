/** 짧은 탭 햅틱 (미지원·거부 시 무시). */
export function hap(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* noop */
  }
}

/** onClick에 감싸 햅틱 후 핸들러 실행. */
export function tap(fn) {
  return (...args) => {
    hap();
    return fn?.(...args);
  };
}
