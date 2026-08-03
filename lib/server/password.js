// 회원 비밀번호 해시 — bcrypt. 평문 저장 금지.
import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(pw) {
  return bcrypt.hash(String(pw || ""), ROUNDS);
}

export async function verifyPassword(pw, hashOrPlain) {
  if (!hashOrPlain) return false;
  const s = String(hashOrPlain);
  // bcrypt 해시 형태면 compare, 아니면(레거시 평문) 거부 — Phase 3부터 평문 로그인 불가
  if (s.startsWith("$2a$") || s.startsWith("$2b$") || s.startsWith("$2y$")) {
    return bcrypt.compare(String(pw || ""), s);
  }
  return false;
}
