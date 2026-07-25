"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, logout } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/constants";
import { DEMO_LOGINS } from "@/lib/demo";
import FlowHeader from "@/components/FlowHeader";
import StepFooter from "@/components/StepFooter";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    setBusy(true);
    let s = await login(email, pw);
    // 시연: 아무 입력이든 회원 콘솔로 (티 내지 않음)
    if (!s && DEMO_MODE) {
      const d = DEMO_LOGINS[0];
      s = await login(d.email, d.password);
    }
    setBusy(false);
    if (!s) { setErr("이메일 또는 비밀번호가 올바르지 않습니다."); return; }
    if (s.role === "admin") { await logout(); setErr("관리자 계정입니다. 관리자 페이지에서 로그인해 주세요."); return; }
    router.replace("/console");
  }

  return (
    <div className="app">
      <FlowHeader title="회원 로그인" sub="사업자 회원 전용" />
      <div className="c-body c-center">
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="field"><label>이메일</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com" autoComplete="username" /></div>
          <div className="field"><label>비밀번호</label>
            <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="비밀번호" autoComplete="current-password" /></div>
          {err && <div className="auth-err">{err}</div>}
        </form>
        <div className="auth-foot">
          <a href="/signup">회원 가입</a>
          <a href="/reset">비밀번호 찾기</a>
        </div>
      </div>
      <StepFooter prev={{ label: "이전", onClick: () => router.push("/") }} next={{ label: busy ? "로그인 중…" : "로그인", onClick: submit, disabled: busy }} />
    </div>
  );
}
