"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RISK_TYPES, CONTRACT_CONSENT_FORM, CONSENT_NOTICES, STATUS_NOTICES, CODE_LABEL, VIOLATION_LABEL, riskTypesFor, DEFAULT_VERTICAL, getVertical } from "@/lib/constants";
import { mask, fmtBirth, fmtDate } from "@/lib/format";
import { listConsents, addRisk } from "@/lib/db";
import { getSession, logout, authHeaders } from "@/lib/auth";
import { tap } from "@/lib/haptic";
import AppHeader from "@/components/AppHeader";
import Icon from "@/components/Icon";
import NoticeList from "@/components/NoticeList";
import { ConsentClauses, CertBadge } from "@/components/VerifyParts";

export default function Console() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState("certs");
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, kind) => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => { const s = getSession(); if (!s) router.replace("/login"); else setSession(s); }, [router]);
  if (session === undefined) {
    return (
      <>
        <AppHeader subtitle={<>회원 콘솔</>} />
        <div className="container">
          <div className="card"><div className="skel" /><div className="skel" /><div className="hint">로그인 확인 중…</div></div>
        </div>
      </>
    );
  }
  if (!session) return null;
  if (session.role !== "admin" && session.status && session.status !== "approved") {
    const rejected = session.status === "rejected";
    return (
      <>
        <AppHeader subtitle={<>회원 콘솔</>} right={<button className="btn btn-sm" style={{ background: "transparent", borderColor: "rgba(255,255,255,.3)", color: "#fff" }} onClick={async () => { await logout(); router.replace("/login"); }}>로그아웃</button>} />
        <div className="container">
          <div className="card" style={{ textAlign: "center", padding: "42px 22px" }}>
            <div style={{ fontSize: 38 }}>{rejected ? "⛔" : "⏳"}</div>
            <h2 style={{ margin: "12px 0 8px", fontSize: 18 }}>{rejected ? "가입이 반려되었습니다" : "승인 대기 중입니다"}</h2>
            <p style={{ color: "var(--ink2)", fontSize: 13.5, lineHeight: 1.65 }}>
              {rejected
                ? "제출하신 서류 확인 결과 가입이 반려되었습니다. 문의: 박영협 010-6393-0926"
                : "관리자가 사업자등록증·대표자 신분증을 확인하고 있습니다. 승인되면 거래코드가 발급되고 바로 이용할 수 있어요. (승인 후 다시 로그인해 주세요)"}
            </p>
          </div>
        </div>
      </>
    );
  }
  const company = session.company;
  const code = session.code || "";

  return (
    <>
      <AppHeader
        subtitle={<>회원 콘솔 · <b style={{ opacity: .95 }}>{company}</b>{code ? ` · ${CODE_LABEL} ${code}` : ""}</>}
        right={<button className="btn btn-sm" style={{ background: "transparent", borderColor: "rgba(255,255,255,.3)", color: "#fff" }} onClick={async () => { await logout(); router.replace("/login"); }}>로그아웃</button>}
      />
      <div className="container">
        <div className="tabs">
          <button className={`tab ${tab === "send" ? "active" : ""}`} onClick={() => setTab("send")}><Icon name="send" /> 안내·동의</button>
          <button className={`tab ${tab === "certs" ? "active" : ""}`} onClick={() => setTab("certs")}><Icon name="file" /> 거래상태</button>
          <button className={`tab ${tab === "register" ? "active" : ""}`} onClick={() => setTab("register")}><Icon name="plus" /> {VIOLATION_LABEL}</button>
        </div>
        {tab === "send" && <SendTab toast={showToast} company={company} code={code} vertical={session.vertical || DEFAULT_VERTICAL} />}
        {tab === "certs" && <CertsTab toast={showToast} company={company} code={code} vertical={session.vertical || DEFAULT_VERTICAL} />}
        {tab === "register" && <RegisterTab toast={showToast} company={company} vertical={session.vertical || DEFAULT_VERTICAL} />}
      </div>
      {toast && <div className="toast-host"><div className={`toast ${toast.kind || ""}`}>{toast.msg}</div></div>}
    </>
  );
}

/* ---------- 거래상태 (손님이 보낸 상태 검증) ---------- */
function CertsTab({ toast, company, code, vertical }) {
  const V = getVertical(vertical);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [authErr, setAuthErr] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setAuthErr("");
    try {
      const r = await fetch("/api/v1/cert", { headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) {
        setList([]);
        setAuthErr("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        toast("다시 로그인해 주세요.", "danger");
        return;
      }
      if (r.ok && j.ok) setList(j.certificates || []);
      else { setList([]); toast(j.error || "거래상태를 불러오지 못했습니다.", "danger"); }
    } catch (e) {
      console.error(e);
      setList([]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="card">
      <div className="card-title">
        거래상태 확인
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink3)" }}> · {list.length}건</span>
        <button type="button" className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={reload}>새로고침</button>
      </div>
      <div className="card-desc">
        손님이 <b>동의</b>하거나 <b>내 상태 보기</b>로 우리 {CODE_LABEL}(<b>{code || "—"}</b>)에 귀속해 보낸
        <b> {V.certName || "상태 검증"}</b>이 여기에 쌓입니다. 캡처가 아니라 이 기록·상태 링크로만 확인하세요.
      </div>
      {authErr && <div className="auth-err" style={{ marginBottom: 12 }}>{authErr}</div>}
      {loading ? <><div className="skel" /><div className="skel" /></> :
        list.length === 0 ? (
          <div className="empty">
            아직 수신된 거래상태가 없습니다.<br />
            「안내·동의」탭에서 링크를 보내 손님이 동의를 완료하면 여기에 표시됩니다.
          </div>
        ) : list.map((c) => {
          const hit = (c.summary?.seriousBreaches || 0) > 0 || c.trustLevel === "기록 있음" || c.negativeHistory;
          const isOpen = open === c.id;
          return (
            <div key={c.id} style={{ borderBottom: "1px solid var(--line2)" }}>
              <div className="risk-row" style={{ borderBottom: "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="type">{mask(c.subjectName)} · {c.trustLevel || "-"}</div>
                  <div className="meta">{c.certName || V.certName || "상태 검증"} · {fmtDate(c.submittedAt || c.issuedAt)}</div>
                </div>
                <span className={`badge ${hit ? "b-red" : "b-green"}`}>
                  <span className="dot" />
                  {hit ? `이력 ${c.summary?.seriousBreaches || 1}` : "신규"}
                </span>
                <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setOpen(isOpen ? null : c.id)}>
                  {isOpen ? "닫기" : "상세"}
                </button>
              </div>
              {isOpen && (
                <div style={{ padding: "0 0 14px" }}>
                  <div className="receipt" style={{ marginTop: 0 }}>
                    <div className="r"><span className="k">이름</span><span className="v">{mask(c.subjectName)}</span></div>
                    <div className="r"><span className="k">본인확인</span><span className="v">{c.identityVerified ? `완료${c.method ? ` · ${c.method}` : ""}` : "-"}</span></div>
                    <div className="r"><span className="k">거래상태</span><span className="v">{c.trustLevel || "-"}</span></div>
                    <div className="r"><span className="k">확인된 이력</span><span className="v">{c.summary?.confirmedAdoptionsOrDeals ?? 0}건</span></div>
                    <div className="r"><span className="k">중대 위반(확정)</span><span className="v">{c.summary?.seriousBreaches ?? 0}건</span></div>
                    <div className="r"><span className="k">수신</span><span className="v mono">{fmtDate(c.submittedAt || c.issuedAt)}</span></div>
                    {c.expiresAt && <div className="r"><span className="k">링크 유효</span><span className="v mono">{fmtDate(c.expiresAt)}</span></div>}
                  </div>
                  {c.notice && <p className="hint" style={{ marginTop: 8 }}>{c.notice}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <a className="btn btn-primary btn-sm" href={`/v?id=${encodeURIComponent(c.id)}`} target="_blank" rel="noreferrer">
                      상태 링크 열기
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

/* ---------- 동의·검증 요청 ---------- */
function SendTab({ toast, company, code, vertical }) {
  const V = getVertical(vertical);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTpl, setShowTpl] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showStatusPreview, setShowStatusPreview] = useState(false);
  const [open, setOpen] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const consentUrl = origin && code ? `${origin}/consent?code=${code}` : "";

  async function copyText(t, okMsg = "복사되었습니다.") {
    if (!t) { toast("복사할 내용이 없습니다.", "danger"); return false; }
    try {
      await navigator.clipboard?.writeText(t);
      toast(okMsg, "safe");
      return true;
    } catch {
      toast("복사에 실패했습니다. 길게 눌러 복사해 주세요.", "danger");
      return false;
    }
  }

  async function copyConsentLink() {
    if (!code || !consentUrl) {
      toast(`${CODE_LABEL}가 아직 없습니다. 승인 후 이용해 주세요.`, "danger");
      return;
    }
    const ok = await copyText(consentUrl, "동의 링크가 복사되었습니다.");
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }

  async function shareConsentLink() {
    if (!code || !consentUrl) {
      toast(`${CODE_LABEL}가 아직 없습니다. 승인 후 이용해 주세요.`, "danger");
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: "착한딜 동의 안내",
          text: `${company} 거래 동의 및 내 상태 보내기 링크입니다.`,
          url: consentUrl,
        });
        return;
      } catch {
        /* 사용자가 취소하면 무시 */
      }
    }
    await copyConsentLink();
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try { setList(await listConsents(company)); } catch (e) { console.error(e); }
    setLoading(false);
  }, [company]);
  useEffect(() => { reload(); }, [reload]);

  return (
    <>
      <div className="card code-card">
        <div className="card-title">손님에게 안내 보내기 · {V.label}</div>
        <div className="card-desc">
          링크를 보내면 손님이 <b>동의 및 내 상태 보내기</b>를 진행합니다. 완료되면 <b>거래상태</b> 탭에서 확인할 수 있습니다.
        </div>
        {consentUrl && (
          <div className="share-url" style={{ marginTop: 4, marginBottom: 12 }}>{consentUrl}</div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn"
            style={{ flex: 1 }}
            disabled={!code}
            onClick={tap(copyConsentLink)}
          >
            <Icon name="file" /> {copiedLink ? "복사됨" : "복사"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={!code}
            onClick={tap(shareConsentLink)}
          >
            <Icon name="send" /> 공유
          </button>
        </div>
        <div className="hint" style={{ marginTop: 12 }}>
          {CODE_LABEL}: <b className="mono">{code || "—"}</b>
          {code && (
            <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => copyText(code)}>
              복사
            </button>
          )}
        </div>
        {!code && (
          <div className="hint" style={{ marginTop: 8, color: "var(--danger)" }}>
            {CODE_LABEL}가 없으면 링크를 보낼 수 없습니다. 승인 후 다시 로그인해 주세요.
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">제출된 동의
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink3)", marginLeft: 6 }}>
            · {list.filter((c) => c.status === "completed").length}건
          </span>
          <button type="button" className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={reload}>↻ 새로고침</button>
        </div>
        <div className="card-desc">손님이 동의하면 여기에 남습니다. 캡처가 아니라 이 기록만 확인하세요.</div>
        {loading ? <><div className="skel" /><div className="skel" /></> :
          list.filter((c) => c.status === "completed").length === 0 ? <div className="empty">아직 제출된 동의가 없습니다. 위 링크를 손님에게 보내 주세요.</div> :
            list.filter((c) => c.status === "completed").map((c) => {
              const hasPhotos = c.photos?.id || c.photos?.face;
              return (
                <div key={c.id} style={{ borderBottom: "1px solid var(--line2)" }}>
                  <div className="risk-row" style={{ borderBottom: "none" }}>
                    <div>
                      <div className="type">{mask(c.name)}{c.verified?.birth ? ` · ${fmtBirth(c.verified.birth)}` : ""}</div>
                      <div className="meta">{fmtDate(c.completedAt || c.createdAt)} 제출{c.cert?.unresolved && c.cert.types?.length ? ` · ${c.cert.types.map((t) => RISK_TYPES[t] || t).join(", ")}` : ""}</div>
                    </div>
                    <div className="sp" />
                    {hasPhotos && <button type="button" className="btn btn-sm" style={{ marginRight: 8 }} onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "대조 닫기" : "신분증·얼굴 대조"}</button>}
                    <CertBadge cert={c.cert} />
                    {c.certId && (
                      <a className="btn btn-sm" style={{ marginLeft: 8 }} href={`/v?id=${encodeURIComponent(c.certId)}`} target="_blank" rel="noreferrer">상태</a>
                    )}
                  </div>
                  {open === c.id && hasPhotos && (
                    <div style={{ display: "flex", gap: 10, padding: "2px 0 12px" }}>
                      {c.photos?.id && <figure style={{ flex: 1, margin: 0 }}><img src={c.photos.id} alt="신분증" style={{ width: "100%", borderRadius: "var(--radius)", border: "1px solid var(--line)" }} /><figcaption style={{ fontSize: 11, color: "var(--ink3)", textAlign: "center", marginTop: 4 }}>신분증</figcaption></figure>}
                      {c.photos?.face && <figure style={{ flex: 1, margin: 0 }}><img src={c.photos.face} alt="본인 얼굴" style={{ width: "100%", borderRadius: "var(--radius)", border: "1px solid var(--line)" }} /><figcaption style={{ fontSize: 11, color: "var(--ink3)", textAlign: "center", marginTop: 4 }}>본인 얼굴</figcaption></figure>}
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      <div className="card">
        <div className="card-title">손님이 보는 동의 내용
          <button type="button" className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => setShowPreview((v) => !v)}>{showPreview ? "접기" : "미리보기"}</button>
        </div>
        {showPreview && (
          <>
            <div className="card-desc">손님이 <b>이번 거래에 동의</b>에서 아래 내용을 확인하고 동의합니다.</div>
            <NoticeList items={CONSENT_NOTICES} />
            <ConsentClauses />
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">손님이 보는 상태확인 내용
          <button type="button" className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => setShowStatusPreview((v) => !v)}>{showStatusPreview ? "접기" : "미리보기"}</button>
        </div>
        {showStatusPreview && (
          <>
            <div className="card-desc">손님이 본인확인 후 보는 상태 안내입니다.</div>
            <NoticeList items={STATUS_NOTICES} />
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">개인정보 동의서에 항목 추가
          <button type="button" className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => setShowTpl((v) => !v)}>{showTpl ? "접기" : "양식 보기"}</button>
        </div>
        {showTpl && (
          <>
            <div className="card-desc"><b>계약서는 그대로 두고</b>, 기존 「개인정보 수집·이용 동의서」에 아래 <b>제3자 제공 동의 항목만 별도로</b> 추가하면 됩니다. (디지털 동의를 못 쓰는 경우 대안) <b>이 방식으로 받은 동의서는 회원이 직접 보관·관리</b>하며, 착한딜 플랫폼에는 기록되지 않습니다.</div>
            <div className="tpl-label">개인정보 제3자 제공 동의 항목
              <button type="button" className="btn btn-sm" onClick={() => copyText(CONTRACT_CONSENT_FORM)}><Icon name="file" /> 복사</button></div>
            <pre className="tpl">{CONTRACT_CONSENT_FORM}</pre>
          </>
        )}
      </div>
    </>
  );
}

/* ---------- 위반 등록 ---------- */
function RegisterTab({ toast, company, vertical = DEFAULT_VERTICAL }) {
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [completed, setCompleted] = useState([]);
  const types = riskTypesFor(vertical);

  useEffect(() => {
    listConsents(company).then((cs) => setCompleted(cs.filter((c) => c.status === "completed"))).catch(() => {});
  }, [company]);

  function pick(cid) {
    const c = completed.find((x) => x.id === cid);
    if (c) { setName(c.name || ""); setBirth(c.verified?.birth || ""); }
    else { setName(""); setBirth(""); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || birth.replace(/\D/g, "").length < 6) { toast("이름·생년월일을 확인해 주세요.", "danger"); return; }
    const f = e.target;
    const reason = f.reason.value.trim();
    if (!reason) { toast("등록 사유를 입력해 주세요.", "danger"); return; }
    setBusy(true);
    try {
      await addRisk({
        name: name.trim(), birth, type: f.type.value, company, vertical,
        license: f.license.value.trim(), phone: f.phone.value.trim(), reason,
        evidence: evidence || "(증빙 메모 없음)",
      });
      f.reset(); setName(""); setBirth(""); setEvidence("");
      toast(`${VIOLATION_LABEL} 내역이 등록되었습니다.`, "safe");
    } catch (err) { console.error(err); toast(err?.message || "저장 실패 — 로그인·권한을 확인하세요.", "danger"); }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="card-title">{VIOLATION_LABEL} 등록</div>
      <div className="card-desc">중대한 계약 위반이 발생한 경우에만, <b>동의받은 손님에 한해</b> 등록합니다. 등록처는 로그인 회원({company})으로 자동 기록됩니다.</div>
      <form onSubmit={submit}>
        <div className="grid">
          {completed.length > 0 && (
            <div className="field full"><label>동의완료 손님에서 선택 <span className="opt">선택 시 자동입력</span></label>
              <select onChange={(e) => pick(e.target.value)} defaultValue="">
                <option value="">직접 입력</option>
                {completed.map((c) => <option key={c.id} value={c.id}>{mask(c.name)} · {fmtBirth(c.verified?.birth)}</option>)}
              </select></div>
          )}
          <div className="field full"><label>이름 <span className="req">*</span></label><input value={name} onChange={(e) => setName(e.target.value)} required placeholder="홍길동" /></div>
          <div className="field full"><label>생년월일 <span className="req">*</span></label><input value={birth} onChange={(e) => setBirth(e.target.value)} required inputMode="numeric" maxLength={6} placeholder="900715" /></div>
          <div className="field full"><label>위반 유형 <span className="req">*</span></label>
            <select name="type" required>{Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field full"><label>{vertical === "rent" ? "운전면허번호" : "참고번호"}</label>
            <input name="license" placeholder={vertical === "rent" ? "11-22-334455-66" : "계약번호·고객번호 등"} /></div>
          <div className="field full"><label>휴대폰번호</label><input name="phone" inputMode="numeric" placeholder="010-0000-0000" /></div>
          <div className="field full"><label>등록 사유 <span className="req">*</span></label>
            <textarea name="reason" rows={3} required placeholder="계약·이용 조건 미이행 경위 (객관적 사실 위주)" /></div>
          <div className="field full">
            <label>증빙 메모 <span className="opt">보관 중인 증빙 요약</span></label>
            <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={2} placeholder="예: 내용증명·미납내역 PDF 보관 중" />
          </div>
        </div>
        <div className="actions"><button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? "등록 중…" : `＋ ${VIOLATION_LABEL} 등록`}</button></div>
      </form>
    </div>
  );
}
