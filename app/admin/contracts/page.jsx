"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeaders, getSession } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";

/**
 * 전자계약 확인 — 담당자가 신분증과 얼굴을 «눈으로» 대조하는 자리.
 *
 * 공급사가 아직 시스템을 직접 못 쓰므로 관리자가 대신한다.
 * 사진을 받아 두는 것만으로는 본인확인이 아니다 — 아무도 안 보면
 * 나중에 다투었을 때 「받기만 했고 확인은 안 했다」가 된다.
 *
 * 화면 원칙: 담당자가 판단할 것 두 개(신분증·얼굴)를 «나란히, 크게» 놓고
 * 나머지는 그 아래로 내린다. 목록에서는 「내가 손볼 것」이 맨 위에 온다.
 */

const fmt = (ms) => (ms ? new Date(Number(ms)).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "—");
const fmtBirth = (b) => {
  const s = String(b || "").replace(/\D/g, "");
  return s.length === 6 ? `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4, 6)}` : b || "—";
};

/** 담당자가 무엇을 해야 하는지 한 낱말로. 색은 급한 것에만 쓴다. */
function statusOf(c) {
  if (c.signedAt && !c.identityVerifiedByStaff) return { label: "확인 필요", tone: "urgent" };
  if (c.signedAt) return { label: "확인 완료", tone: "done" };
  if (c.openedAt) return { label: "진행 중", tone: "" };
  return { label: "발송됨", tone: "" };
}

const TONE = {
  urgent: { background: "#fdecec", color: "#b02a2a", borderColor: "#f3c9c9" },
  done: { background: "#eaf5ee", color: "#1d7a42", borderColor: "#cbe6d5" },
  "": { background: "#f1f4f7", color: "#5b6b7b", borderColor: "#e2e8ee" },
};

function Badge({ tone, children }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11.5,
      fontWeight: 700, border: "1px solid", whiteSpace: "nowrap", ...TONE[tone || ""],
    }}>
      {children}
    </span>
  );
}

function Row({ label, value, mono }) {
  if (value === "" || value === null || value === undefined) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px dashed #eef2f6" }}>
      <span style={{ flex: "0 0 108px", color: "#7c8a98", fontSize: 12.5 }}>{label}</span>
      <span style={{
        flex: 1, fontSize: 13, fontWeight: 600, wordBreak: "break-all",
        fontFamily: mono ? "ui-monospace, Menlo, monospace" : "inherit",
      }}>
        {value}
      </span>
    </div>
  );
}

/** 사진은 크게 봐야 판단이 된다. 클릭하면 원본 크기로 새 창. */
function Photo({ label, src, tall }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "#7c8a98", marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {src ? (
        <img
          src={src}
          alt={label}
          onClick={() => { const w = window.open(""); if (w) w.document.write(`<img src="${src}" style="max-width:100%">`); }}
          style={{
            width: "100%", height: tall ? 300 : 220, objectFit: "contain", cursor: "zoom-in",
            background: "#0d1b2a", borderRadius: 10, border: "1px solid #e2e8ee",
          }}
        />
      ) : (
        <div style={{
          height: tall ? 300 : 220, display: "grid", placeItems: "center", borderRadius: 10,
          background: "#f7f9fb", border: "1px dashed #d9e2ea", color: "#9aa8b5", fontSize: 13,
        }}>
          없음
        </div>
      )}
    </div>
  );
}

export default function AdminContracts() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [rows, setRows] = useState([]);
  const [openId, setOpenId] = useState("");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [suppOpen, setSuppOpen] = useState(false);
  const [suppMsg, setSuppMsg] = useState("");
  const [suppItems, setSuppItems] = useState({});

  useEffect(() => {
    const s = getSession();
    setSession(s && s.role === "admin" ? s : null);
  }, []);

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await fetch("/api/v1/admin/contracts", { headers: await authHeaders(), cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "목록을 불러오지 못했습니다.");
      setRows(j.contracts || []);
    } catch (e) { setErr(e?.message || "목록을 불러오지 못했습니다."); }
  }, []);

  useEffect(() => { if (session) load(); }, [session, load]);

  const open = useCallback(async (contractId) => {
    setOpenId(contractId); setDetail(null); setErr(""); setSuppOpen(false); setSuppMsg(""); setSuppItems({});
    try {
      const r = await fetch(`/api/v1/admin/contracts/${encodeURIComponent(contractId)}`, {
        headers: await authHeaders(), cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "계약을 불러오지 못했습니다.");
      setDetail(j.contract);
    } catch (e) { setErr(e?.message || "계약을 불러오지 못했습니다."); }
  }, []);

  async function act(action, payload = {}) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/v1/admin/contracts/${encodeURIComponent(openId)}`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action, ...payload }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "처리하지 못했습니다.");
      await open(openId);
      await load();
      return j;
    } catch (e) { setErr(e?.message || "처리하지 못했습니다."); return null; }
    finally { setBusy(false); }
  }

  /** 계약서 사본은 회원사 자격으로 여는 것이 아니라, 담당자가 내용을 대조하려고 연다. */
  async function openDocument() {
    const w = window.open("", "_blank");
    try {
      const r = await fetch(`/api/v1/contract/${encodeURIComponent(openId)}/document`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "계약서를 열지 못했습니다.");
      if (w) w.location.href = j.url;
    } catch (e) { if (w) w.close(); setErr(e?.message || "계약서를 열지 못했습니다."); }
  }

  if (session === undefined) return <div className="app"><div className="c-body"><div className="skel" /></div></div>;
  if (session === null) {
    return (
      <div className="app">
        <AppHeader subtitle="전자계약" />
        <div className="c-body">
          <div className="auth-err">관리자만 볼 수 있습니다.</div>
          <button type="button" className="btn-primary" style={{ marginTop: 12 }} onClick={() => router.push("/admin")}>
            관리자 로그인
          </button>
        </div>
      </div>
    );
  }

  const needAction = rows.filter((r) => r.signedAt && !r.identityVerifiedByStaff).length;

  return (
    <div className="app">
      <AppHeader subtitle="전자계약 확인" />
      <div className="c-body" style={{ maxWidth: 980, margin: "0 auto" }}>
        {toast && <div className="toast">{toast}</div>}
        {err && <div className="auth-err" style={{ marginBottom: 12 }}>{err}</div>}

        {!openId && (
          <>
            <div className="stitle" style={{ marginBottom: 4 }}>
              전자계약 {rows.length}건
              {needAction > 0 && <span style={{ color: "#b02a2a" }}> · 확인 필요 {needAction}</span>}
            </div>
            <p className="sdesc">서명이 끝났는데 담당자 확인이 안 된 계약이 맨 위에 옵니다.</p>

            <div style={{ marginTop: 12, border: "1px solid #e2e8ee", borderRadius: 12, overflow: "hidden" }}>
              {rows.length === 0 && (
                <div style={{ padding: 20, color: "#7c8a98", fontSize: 13 }}>발급된 전자계약이 없습니다.</div>
              )}
              {rows.map((c) => {
                const st = statusOf(c);
                return (
                  <button
                    type="button"
                    key={c.contractId}
                    onClick={() => open(c.contractId)}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "12px 14px",
                      background: "#fff", border: 0, borderBottom: "1px solid #eef2f6", cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{c.signerName || "이름 없음"}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#9aa8b5" }}>{fmt(c.issuedAt)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#5b6b7b", display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>{c.externalRef || c.contractId}</span>
                      <span>{c.memberCompany}</span>
                      <span>서류 {c.docsSubmitted}/{c.docsRequired}</span>
                      <span>{c.identitySubmitted ? "촬영본 있음" : "촬영본 없음"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {openId && (
          <>
            <button
              type="button"
              onClick={() => { setOpenId(""); setDetail(null); }}
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "#5b6b7b", fontWeight: 700, fontSize: 13 }}
            >
              ← 목록
            </button>

            {!detail && <div className="skel" style={{ marginTop: 14 }} />}

            {detail && (
              <>
                <div className="stitle" style={{ marginTop: 10, marginBottom: 2 }}>
                  {detail.signer?.name || "이름 없음"}
                  <span style={{ marginLeft: 8 }}>
                    <Badge tone={detail.identity?.staffVerifiedAt ? "done" : detail.signedAt ? "urgent" : ""}>
                      {detail.identity?.staffVerifiedAt ? "확인 완료" : detail.signedAt ? "확인 필요" : "진행 중"}
                    </Badge>
                  </span>
                </div>
                <p className="sdesc">{detail.externalRef} · {detail.memberCompany}</p>

                {/* ① 판단할 것 — 신분증과 얼굴을 나란히. 이게 이 화면의 본론이다. */}
                <div style={{ marginTop: 14, padding: 14, border: "1px solid #e2e8ee", borderRadius: 12, background: "#fff" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>본인확인</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <Photo label="신분증" src={detail.identity?.idCard} tall />
                    <Photo label="얼굴" src={detail.identity?.selfie} tall />
                  </div>

                  <div style={{ marginTop: 12, padding: 10, background: "#f7f9fb", borderRadius: 9 }}>
                    <div style={{ fontSize: 12, color: "#7c8a98", marginBottom: 4 }}>계약서에 적힌 사람</div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>
                      {detail.signer?.name || "—"}
                      <span style={{ marginLeft: 10, fontWeight: 600, color: "#5b6b7b", fontSize: 13 }}>
                        {fmtBirth(detail.signer?.birth)} · {detail.signer?.phone || "—"}
                      </span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#7c8a98" }}>
                      위 신분증의 이름·생년월일이 같은지, 얼굴이 같은 사람인지 보세요.
                    </div>
                  </div>

                  {detail.identity?.staffVerifiedAt ? (
                    <div style={{ marginTop: 12, padding: 10, background: "#eaf5ee", borderRadius: 9, fontSize: 13 }}>
                      <b>{fmt(detail.identity.staffVerifiedAt)}</b> 확인 완료
                      {detail.identity.staffVerifiedBy && <> · {detail.identity.staffVerifiedBy}</>}
                      {detail.identity.staffNote && <div style={{ marginTop: 4, color: "#4a5c6b" }}>{detail.identity.staffNote}</div>}
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busy || !detail.identity?.idCard || !detail.identity?.selfie}
                        style={{ flex: 1, minWidth: 180 }}
                        onClick={async () => {
                          if (!window.confirm("신분증과 얼굴이 계약자 본인이 맞습니까?\n확인 시각이 기록되며 되돌릴 수 없습니다.")) return;
                          const r = await act("verify_identity");
                          if (r) { setToast("본인확인을 기록했습니다."); setTimeout(() => setToast(""), 2600); }
                        }}
                      >
                        본인확인 완료
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setSuppOpen((v) => !v)}
                        style={{
                          flex: 1, minWidth: 140, padding: "12px 14px", borderRadius: 9, cursor: "pointer",
                          background: "#fff", border: "1px solid #d9e2ea", fontWeight: 700, fontSize: 14,
                        }}
                      >
                        보완 요청
                      </button>
                    </div>
                  )}

                  {suppOpen && (
                    <div style={{ marginTop: 10, padding: 12, border: "1px solid #e2e8ee", borderRadius: 10 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>무엇을 다시 받아야 합니까?</div>
                      {["신분증 재촬영", "얼굴 재촬영", ...(detail.requiredDocs || []).map((d) => d.label || d.key)].map((label) => (
                        <label key={label} style={{ display: "flex", gap: 7, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={!!suppItems[label]}
                            onChange={(e) => setSuppItems((p) => ({ ...p, [label]: e.target.checked }))}
                          />
                          {label}
                        </label>
                      ))}
                      <textarea
                        value={suppMsg}
                        onChange={(e) => setSuppMsg(e.target.value)}
                        placeholder="사유 (예: 신분증 글자가 흐려 확인이 어렵습니다)"
                        rows={2}
                        style={{ width: "100%", marginTop: 8, padding: 9, borderRadius: 8, border: "1px solid #d9e2ea", fontSize: 13, resize: "vertical" }}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busy}
                        style={{ width: "100%", marginTop: 8 }}
                        onClick={async () => {
                          const items = Object.entries(suppItems).filter(([, v]) => v).map(([k]) => k);
                          const r = await act("request_supplement", { items, message: suppMsg });
                          if (r) { setSuppOpen(false); setSuppMsg(""); setSuppItems({}); setToast("보완 요청을 남겼습니다."); setTimeout(() => setToast(""), 2600); }
                        }}
                      >
                        보완 요청 남기기
                      </button>
                      <p className="sdesc" style={{ marginTop: 6 }}>
                        기록만 남습니다. 손님에게는 담당자가 직접 연락해 주세요.
                      </p>
                    </div>
                  )}

                  {(detail.supplements || []).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: "#7c8a98", marginBottom: 5 }}>보완 요청 이력</div>
                      {detail.supplements.map((s, i) => (
                        <div key={i} style={{ padding: 8, background: "#fdf6e8", borderRadius: 8, marginBottom: 6, fontSize: 12.5 }}>
                          <b>{fmt(s.requestedAt)}</b> {s.staff && `· ${s.staff}`}
                          {s.items?.length > 0 && <div>{s.items.join(" · ")}</div>}
                          {s.message && <div style={{ color: "#5b6b7b" }}>{s.message}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ② 계약 진행 상태 */}
                <div style={{ marginTop: 12, padding: 14, border: "1px solid #e2e8ee", borderRadius: 12, background: "#fff" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>계약</div>
                  <Row label="계약번호" value={detail.externalRef} />
                  <Row label="발행" value={fmt(detail.issuedAt)} />
                  <Row label="열람" value={fmt(detail.openedAt)} />
                  <Row label="서명" value={fmt(detail.signedAt)} />
                  <Row label="검증번호" value={detail.verifyNo} mono />
                  <Row label="봉인 해시" value={detail.sealHash} mono />
                  {detail.signedAt && (
                    <button
                      type="button"
                      onClick={openDocument}
                      style={{
                        marginTop: 10, width: "100%", padding: "11px 14px", borderRadius: 9, cursor: "pointer",
                        background: "#fff", border: "1px solid #d9e2ea", fontWeight: 700, fontSize: 13.5,
                      }}
                    >
                      계약서 보기 (A4)
                    </button>
                  )}
                </div>

                {/* ③ 손님이 채운 값 — 계약서와 대조할 것 */}
                {Object.keys(detail.inputs || {}).length > 0 && (
                  <div style={{ marginTop: 12, padding: 14, border: "1px solid #e2e8ee", borderRadius: 12, background: "#fff" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>손님이 입력한 값</div>
                    {(detail.inputGroups || []).flatMap((g) => g.fields || []).map((f) => (
                      <Row key={f.key} label={f.label || f.key} value={detail.inputs[f.key]} />
                    ))}
                  </div>
                )}

                {/* ④ 제출 서류 */}
                {(detail.documents || []).length > 0 && (
                  <div style={{ marginTop: 12, padding: 14, border: "1px solid #e2e8ee", borderRadius: 12, background: "#fff" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>
                      제출 서류 {detail.documents.length}/{(detail.requiredDocs || []).filter((d) => d.required).length}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {detail.documents.map((d) => (
                        <div key={d.key} style={{ flex: "1 1 200px", minWidth: 0 }}>
                          <Photo label={`${d.label} · ${fmt(d.submittedAt)}`} src={d.image} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ⑤ 서명 */}
                {detail.signature && (
                  <div style={{ marginTop: 12, padding: 14, border: "1px solid #e2e8ee", borderRadius: 12, background: "#fff" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>서명</div>
                    <img
                      src={detail.signature}
                      alt="서명"
                      style={{ maxWidth: 280, width: "100%", background: "#fff", border: "1px solid #e2e8ee", borderRadius: 8, padding: 8 }}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
