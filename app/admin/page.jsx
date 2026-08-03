"use client";

import { useEffect, useState, useCallback } from "react";
import { RISK_TYPES } from "@/lib/constants";
import { mask, fmtBirth, cleanBirth, fmtDate } from "@/lib/format";
import { listAppeals, resolveAppeal, listRisks } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import Icon from "@/components/Icon";
import FlowHeader from "@/components/FlowHeader";
import StepFooter from "@/components/StepFooter";
import { useRouter } from "next/navigation";
import { getSession, logout, login, listPendingMembers, approveMember, rejectMember, listAudits } from "@/lib/auth";

export default function Admin() {
  const router = useRouter();
  const [session, setSession] = useState(undefined); // undefined=확인중, null=로그인필요, obj=관리자
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [appeals, setAppeals] = useState([]);
  const [risks, setRisks] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [members, setMembers] = useState([]);
  const [omid, setOmid] = useState(null);

  useEffect(() => {
    const s = getSession();
    setSession(s && s.role === "admin" ? s : null);
  }, []);

  async function adminLogin() {
    setErr("");
    setBusy(true);
    const s = await login(email, pw);
    setBusy(false);
    if (!s) { setErr("이메일 또는 비밀번호가 올바르지 않습니다."); return; }
    if (s.role !== "admin") { await logout(); setErr("관리자 전용 계정이 아닙니다."); return; }
    setSession(s);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [a, r, m, au] = await Promise.all([listAppeals(), listRisks(), listPendingMembers(), listAudits(40)]);
      setAppeals(a); setRisks(r); setMembers(m); setAudits(au);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  useEffect(() => { if (session) reload(); }, [reload, session]);

  async function approve(a) {
    await resolveAppeal(a);
    setToast("해제 처리되었습니다. 해당 거래 위반사항이 해소되었습니다.");
    setTimeout(() => setToast(null), 2600);
    reload();
  }

  async function approveMem(m) {
    const code = await approveMember(m.id);
    setToast(`${m.company} 승인 완료 · 거래코드 ${code} 발급`);
    setTimeout(() => setToast(null), 3200);
    reload();
  }
  async function rejectMem(m) {
    if (!confirm(`${m.company} 가입을 반려할까요?`)) return;
    await rejectMember(m.id);
    setToast(`${m.company} 가입을 반려했습니다.`);
    setTimeout(() => setToast(null), 2600);
    reload();
  }

  const pending = appeals.filter((a) => a.status === "pending");
  const doneAppeals = appeals.filter((a) => a.status !== "pending");
  const active = risks.filter((r) => r.status === "active");
  const resolved = risks.filter((r) => r.status === "resolved");
  const people = new Set(active.map((r) => `${r.name}|${cleanBirth(r.birth)}`)).size;

  if (session === undefined) return null;
  if (session === null) return (
    <div className="app">
      <FlowHeader title="관리자 로그인" sub="착한딜 관리자 전용" />
      <div className="c-body c-center">
        <div className="admin-lock">
          <span className="lk"><Icon name="shield" size={30} /></span>
          <div className="tx">관리자만 접근할 수 있는 페이지입니다.<br />권한이 있는 계정으로 로그인해 주세요.</div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); adminLogin(); }}>
          <div className="field"><label>이메일</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="관리자 이메일" autoComplete="username" /></div>
          <div className="field"><label>비밀번호</label>
            <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="비밀번호" autoComplete="current-password" /></div>
          {err && <div className="auth-err">{err}</div>}
        </form>
      </div>
      <StepFooter prev={{ label: "이전", onClick: () => router.push("/") }} next={{ label: busy ? "확인 중…" : "로그인", onClick: adminLogin, disabled: busy }} />
    </div>
  );

  return (
    <>
      <AppHeader subtitle="플랫폼 관리자 · 등록 현황 · 소명 심사"
        right={<button className="btn btn-sm" style={{ background: "transparent", borderColor: "rgba(255,255,255,.3)", color: "#fff" }} onClick={async () => { await logout(); setSession(null); }}>로그아웃</button>} />
      <div className="container">

        <div className="stat-row">
          <div className="stat-box"><div className="v">{people}</div><div className="k">등록 인원</div></div>
          <div className="stat-box"><div className="v">{active.length}</div><div className="k">유효 건수</div></div>
          <div className="stat-box"><div className="v">{pending.length}</div><div className="k">소명 대기</div></div>
        </div>

        {/* 회원사 가입 승인 */}
        <div className="card">
          <div className="card-title">회원사 가입 승인 <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink3)" }}>· 대기 {members.length}건</span></div>
          {loading ? <><div className="skel" /><div className="skel" /></> :
            members.length === 0 ? <div className="empty">대기 중인 가입 신청이 없습니다.</div> :
              members.map((m) => (
                <div key={m.id} style={{ borderBottom: "1px solid #eef2f6" }}>
                  <div className="risk-row" style={{ borderBottom: "none", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div className="type">{m.company}</div>
                      <div className="meta">{m.email}{m.bizNo ? ` · ${m.bizNo}` : ""}{m.ceo ? ` · 대표 ${m.ceo}` : ""}{m.service ? ` · ${m.service}` : ""}</div>
                    </div>
                    <button className="btn btn-sm" onClick={() => setOmid(omid === m.id ? null : m.id)}>{omid === m.id ? "닫기" : "서류"}</button>
                    <button className="btn btn-sm btn-safe" style={{ marginLeft: 6 }} onClick={() => approveMem(m)}>승인</button>
                    <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => rejectMem(m)}>반려</button>
                  </div>
                  {omid === m.id && (
                    <div style={{ display: "flex", gap: 10, padding: "2px 0 12px" }}>
                      <DocView label="사업자등록증" src={m.bizImage} />
                      <DocView label="대표자 신분증" src={m.ceoIdImage} />
                    </div>
                  )}
                </div>
              ))}
        </div>

        {/* 소명 대기 */}
        <div className="card">
          <div className="card-title">소명 심사 <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink3)" }}>· 대기 {pending.length}건</span>
            <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={reload}>새로고침</button>
          </div>
          {loading ? <><div className="skel" /><div className="skel" /></> :
            pending.length === 0 ? <div className="empty">대기 중인 소명이 없습니다.</div> :
              pending.map((a) => (
                <div className="risk-row" key={a.id} style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div className="type">{mask(a.name)} · {fmtBirth(a.birth)} {a.type ? `· ${RISK_TYPES[a.type] || a.type}` : ""}</div>
                    <div className="meta">{a.channel === "self" ? "셀프(본인인증)" : "수동"} 소명 · {a.note || "내용 없음"}</div>
                  </div>
                  <button className="btn btn-sm btn-safe" onClick={() => approve(a)}>해제 승인</button>
                </div>
              ))}
        </div>

        {/* 전체 등록 거래이력 */}
        <div className="card">
          <div className="card-title">전체 등록 거래이력 <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink3)" }}>· 유효 {active.length} / 해소 {resolved.length}</span></div>
          {loading ? <><div className="skel" /><div className="skel" /></> :
            risks.length === 0 ? <div className="empty">등록된 거래이력이 없습니다.</div> :
              risks.map((r) => (
                <div className="risk-row" key={r.id}>
                  <div>
                    <div className="type">{mask(r.name)} · {fmtBirth(r.birth)} · {RISK_TYPES[r.type] || r.type}</div>
                    <div className="meta">{r.company || "-"} · {fmtDate(r.createdAt)}</div>
                  </div>
                  <div className="sp" />
                  {r.status === "active"
                    ? <span className="badge b-red"><span className="dot" />유효</span>
                    : <span className="badge b-green"><span className="dot" />해소</span>}
                </div>
              ))}
        </div>

        {doneAppeals.length > 0 && (
          <div className="card">
            <div className="card-title">소명 처리 완료 <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink3)" }}>· {doneAppeals.length}건</span></div>
            {doneAppeals.map((a) => (
              <div className="risk-row" key={a.id}>
                <div><div className="type">{mask(a.name)} · {fmtBirth(a.birth)}</div><div className="meta">{a.note || ""}</div></div>
                <div className="sp" /><span className="badge b-green"><span className="dot" />해제됨</span>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <div className="card-title">감사 로그 <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink3)" }}>· 최근 {audits.length}건</span></div>
          {loading ? <><div className="skel" /><div className="skel" /></> :
            audits.length === 0 ? <div className="empty">아직 감사 로그가 없습니다. 조회·등록·동의 시 자동 기록됩니다.</div> :
              audits.map((u) => (
                <div className="risk-row" key={u.id || `${u.action}-${u.at}`}>
                  <div>
                    <div className="type">{u.action}</div>
                    <div className="meta">{u.actor || "-"} · {u.at ? fmtDate(u.at) : "-"}{u.meta?.company ? ` · ${u.meta.company}` : ""}{u.meta?.kind ? ` · ${u.meta.kind}` : ""}</div>
                  </div>
                </div>
              ))}
        </div>
      </div>
      {toast && <div className="toast-host"><div className="toast safe">{toast}</div></div>}
    </>
  );
}

function DocView({ label, src }) {
  if (!src) return <div style={{ flex: 1, fontSize: 11, color: "var(--ink3)", textAlign: "center", padding: 18, border: "1px dashed #e6ebf1", borderRadius: 8 }}>{label} 없음</div>;
  const isPdf = src.startsWith("data:application/pdf");
  return (
    <figure style={{ flex: 1, margin: 0, minWidth: 0 }}>
      {isPdf
        ? <a href={src} target="_blank" rel="noreferrer" className="btn btn-sm btn-block">📄 {label} 열기</a>
        : <img src={src} alt={label} style={{ width: "100%", borderRadius: 8, border: "1px solid #e6ebf1", display: "block" }} />}
      <figcaption style={{ fontSize: 11, color: "var(--ink3)", textAlign: "center", marginTop: 4 }}>{label}</figcaption>
    </figure>
  );
}
