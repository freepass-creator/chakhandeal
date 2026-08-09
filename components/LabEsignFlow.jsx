"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FlowHeader from "@/components/FlowHeader";
import StepFooter from "@/components/StepFooter";
import SignaturePad from "@/components/SignaturePad";
import AuthFlow, { authProgress } from "@/components/AuthFlow";
import { VerifiedCard } from "@/components/VerifyParts";
import s from "@/components/LabEsignFlow.module.css";

/**
 * 전자계약 렌더러 테스트 — 프리패스가 실제로 보내는 payload 를 그대로 먹는다.
 *
 * 목적 두 가지
 *   ① 시현: 손님 화면이 어떻게 보이는지
 *   ② 수신: 촬영·서명 파일이 서버에 어떻게 도착하는지(경로·크기·해시·시각)
 *
 * payload 를 손으로 고쳐 쓰지 않는다. 정본은 프리패스 `chakhandealIssuePayload` 다.
 * 다시 뜨려면: freepasserp4 에서 `npx tsx scripts/dump-esign-payload.mts`
 *
 * ── 화면 구조 (2026-08-08 사장님 확정) ──────────────────────
 *   본인확인 → 계약서 → 약관 → 첨부서류 → 서명
 *
 * 계약은 «1건»이고 섹션이 여럿이다. 계약서는 페이지를 넘기지 않고 한 장을 내려가며
 * 섹션마다 동의를 받는다. 약관도 같은 방식. 첨부도 한 페이지에서 쭉.
 *
 * ── 표시 규칙 ─────────────────────────────────────────────
 *   **모든 항목은 같은 양식이다.** 항목명이 위, 값이 아래.
 *   값이 「무한」이든 세 줄짜리 설명이든 그릇은 하나다. 구분은 «섹션»이 한다.
 *   (특수 그릇 — 번호판·칩·표·경고박스 — 은 만들었다가 걷어냈다. 항목마다 모양이
 *    다르면 손님이 «무엇을 보는 화면인지» 매번 다시 파악해야 한다.)
 *
 * ⚠ 하위 컴포넌트는 반드시 모듈 스코프에 둔다. 컴포넌트 안에서 정의하면 상태가 바뀔 때마다
 *   React 가 트리를 언마운트→재마운트해서 **스크롤이 튀고 입력 포커스가 빠진다.**
 */

/**
 * 대단계 (2026-08-08 확정)
 *   동의가 «맨 앞»이다 — 신분증을 받으려면 그 전에 수집 동의가 있어야 한다.
 *   계약서 안에서 동의를 받으면 이미 수집한 뒤에 묻는 꼴이 된다.
 *
 *   단, **CMS 동의는 계좌를 적는 자리(계약서 06 결제)에서** 받는다.
 *   맨 앞에 다 몰면 계좌 얘기도 안 나온 상태에서 「출금 대행사에 계좌 제공 동의」를 눌러야 한다.
 *
 *   차량 인수증(인도 시점)·연대보증(번외)은 계약과 별개 문서라 이 여정에 없다.
 */
const MACROS = [
  { key: "consent", label: "동의" },
  { key: "identity", label: "본인확인" },
  { key: "contract", label: "계약서" },
  { key: "terms", label: "약관" },
  { key: "cautions", label: "주의사항" },
  { key: "docs", label: "첨부서류" },
  { key: "sign", label: "서명" },
];

/** 계좌를 받는 자리에서 물어야 하는 동의 — 맨 앞으로 보내지 않는다. */
const AT_POINT_OF_USE = new Set(["bank"]);

/** 값이 «문장»인지 — 그릇은 같고 굵기만 낮춘다. 세 줄을 굵게 두면 읽히지 않는다. */
const isSentence = (v) => v.length > 34;

const hhmm = (ms) => new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

function newSessionId() {
  const r = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  return String(r).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}

/**
 * payload 는 우리가 만든 게 아니라 회원사가 보내는 것이다. 필드가 객체·배열로 와도
 * 화면이 죽으면 안 된다 — 문자열로 눌러서라도 보여준다.
 */
function asText(v) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("파일 읽기 실패"));
    fr.readAsDataURL(file);
  });
}

/** 단 하나의 양식. 항목명 위, 값 아래. */
function Field({ label, value, children }) {
  const v = asText(value);
  if (!children && !v) return null;
  return (
    <div className={s.field}>
      <span className={s.fk}>{asText(label)}</span>
      {children || <p className={`${s.fv} ${isSentence(v) ? s.fvLong : ""}`}>{v}</p>}
    </div>
  );
}

/**
 * 보험만 예외 — 「대인 보상한도 / 대인 면책금」은 짝이라 세로로 쌓으면 쌍이 안 보인다.
 * 라벨 꼬리표로 담보(행)와 항목(열)을 잡는다. 못 잡으면 그냥 일반 양식으로 떨어진다.
 */
const PAIR_SUFFIXES = ["보상한도", "면책금"];

function splitInsurance(rows) {
  const groups = new Map();
  const cols = [];
  const used = new Set();

  (rows || []).forEach((row, i) => {
    const label = asText(row.label);
    const value = asText(row.value);
    if (!value) return;
    const suffix = PAIR_SUFFIXES.find((sfx) => label.endsWith(sfx));
    if (!suffix) return;
    const prefix = label.slice(0, label.length - suffix.length).trim();
    // 접두어에 공백이 있으면(「자차 최소 면책금」) 축이 달라 표에 섞지 않는다.
    if (!prefix || /\s/.test(prefix)) return;
    if (!groups.has(prefix)) groups.set(prefix, {});
    groups.get(prefix)[suffix] = value;
    if (!cols.includes(suffix)) cols.push(suffix);
    used.add(i);
  });

  if (groups.size < 2 || cols.length < 2) return { matrix: null, rest: rows || [] };
  return {
    matrix: { cols, rows: [...groups.entries()].map(([name, cells]) => ({ name, cells })) },
    rest: (rows || []).filter((_, i) => !used.has(i)),
  };
}

function InsuranceMatrix({ matrix }) {
  return (
    <div className={s.matrixWrap}>
      <table className={s.matrix}>
        <thead>
          <tr>
            <th />
            {matrix.cols.map((c) => <th key={c}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              {matrix.cols.map((c) => (
                <td key={c} className={r.cells[c] ? undefined : s.matrixEmpty}>{r.cells[c] || ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionRows({ sectionKey, rows }) {
  const { matrix, rest } = useMemo(
    () => (sectionKey === "insurance" ? splitInsurance(rows) : { matrix: null, rest: rows || [] }),
    [sectionKey, rows],
  );
  return (
    <>
      {matrix && <InsuranceMatrix matrix={matrix} />}
      {(rest || []).map((row, i) => (
        <Field key={`${asText(row.label)}-${i}`} label={row.label} value={row.value} />
      ))}
    </>
  );
}

/** 화면에 들어온 적이 있으면 한 번만 알린다. 한 번 열린 것은 다시 잠그지 않는다. */
function Seen({ onSeen, children, className }) {
  const ref = useRef(null);
  const cb = useRef(onSeen);
  cb.current = onSeen;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          cb.current?.();
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -25% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}

/** 계약서 한 섹션 = 카드 한 장. 헤더(상태) · 항목들 · 하단(그 카드에 대한 동의). */
function ContractSection({ p, open, at, onSeen, onToggle }) {
  const done = !!at;
  return (
    <Seen
      onSeen={onSeen}
      className={[s.card, done ? s.cardDone : "", !open ? s.cardLocked : ""].filter(Boolean).join(" ")}
    >
      <div className={s.head}>
        <span className={s.title}>{asText(p.title)}</span>
        <span className={`${s.badge} ${done ? s.badgeDone : open ? s.badgeReady : s.badgeWait}`}>
          {done ? `확인 ${hhmm(at)}` : open ? "확인 필요" : "내려서 확인"}
        </span>
      </div>

      {p.note && <p className={s.note}>{asText(p.note)}</p>}

      <div className={s.body}>
        <SectionRows sectionKey={p.key} rows={p.rows} />
      </div>

      <div className={`${s.foot} ${done ? s.footDone : ""}`}>
        <label className={`cc ${done ? "on" : ""} ${!open ? "cc-disabled" : ""}`} style={{ margin: 0 }}>
          <input type="checkbox" checked={done} disabled={!open} onChange={(e) => onToggle(e.target.checked)} />
          <span>{asText(p.confirmLabel)}</span>
        </label>
      </div>
    </Seen>
  );
}

function InputGroupBlock({ g, inputs, onInput }) {
  return (
    <div className={s.card}>
      <div className={s.head}>
        <span className={s.title}>{asText(g.title)}</span>
        <span className={`${s.badge} ${s.badgeReady}`}>직접 입력</span>
      </div>

      <div className={s.body}>
        {(g.fields || []).map((f) => (
          <Field key={f.key} label={`${asText(f.label)}${f.required ? " *" : ""}`}>
            {f.type === "select" ? (
              <select className="inp" value={inputs[f.key] || ""} onChange={(e) => onInput(f.key, e.target.value)}>
                <option value="">선택</option>
                {(f.options || []).map((o) => <option key={asText(o)} value={asText(o)}>{asText(o)}</option>)}
              </select>
            ) : (
              <input
                className="inp"
                type={f.type === "tel" ? "tel" : "text"}
                inputMode={f.type === "tel" ? "numeric" : undefined}
                placeholder={asText(f.note)}
                value={inputs[f.key] || ""}
                onChange={(e) => onInput(f.key, e.target.value)}
              />
            )}
          </Field>
        ))}

      </div>
    </div>
  );
}

/**
 * 개인정보 동의 — 한 카드에서 쭉 받되 하나씩 끊는다.
 * 흩어놓으면 어디서 무엇에 동의했는지 손님도 우리도 못 짚는다.
 * **어느 것도 미리 선택해두지 않는다.** 미리 눌린 동의는 동의가 아니다.
 */
function ConsentCard({ atoms, acks, onAck, title = "개인정보 동의" }) {
  const decided = atoms.filter((c) => acks[c.key] !== undefined).length;
  const allAgreed = atoms.every((c) => acks[c.key] === true);
  return (
    <div className={`${s.card} ${allAgreed ? s.cardDone : ""}`}>
      <div className={s.head}>
        <span className={s.title}>{title}</span>
        <span className={`${s.badge} ${allAgreed ? s.badgeDone : s.badgeReady}`}>
          {decided} / {atoms.length} 선택
        </span>
      </div>
      <p className={s.note}>
        아래 {atoms.length}건을 각각 선택해 주세요. 미리 선택된 항목은 없습니다.
      </p>

      <div className={s.body}>
        {atoms.map((c, i) => (
          <div className={s.consentItem} key={c.key}>
            <span className={s.consentNo}>동의 {i + 1} / {atoms.length}</span>
            <div className={s.consentTitle}>{asText(c.label)}{c.required ? " (필수)" : ""}</div>

            <Field label="수집·이용 항목" value={c.items} />
            <Field label="목적" value={c.purpose} />
            <Field label="보유기간" value={c.retention} />

            {/* 제3자 제공은 받는 자마다 목적·항목이 다르다. 같은 양식으로 나눠 적는다. */}
            {Array.isArray(c.recipients) && c.recipients.map((rc, ri) => (
              <Field
                key={ri}
                label={`제공받는 자 — ${asText(rc?.name ?? rc)}`}
                value={[rc?.purpose ? `목적 · ${asText(rc.purpose)}` : "", rc?.items ? `항목 · ${asText(rc.items)}` : ""].filter(Boolean).join("\n")}
              />
            ))}

            <Field label="동의 거부 시" value={c.refusalNote} />

            <Field label={acks[c.key] === undefined ? "동의 여부 — 선택해 주세요" : "동의 여부"}>
              <div className={s.ackRow}>
                <button
                  className={`btn ${acks[c.key] === true ? "btn-safe" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => onAck(c.key, true)}
                >동의함</button>
                <button
                  className={`btn ${acks[c.key] === false ? "btn-danger" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => onAck(c.key, false)}
                >동의하지 않음</button>
              </div>
            </Field>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocBlock({ d, got, preview, busy, onPick }) {
  const ref = useRef(null);
  return (
    <div className={`${s.card} ${got ? s.cardDone : ""}`}>
      <div className={s.head}>
        <span className={s.title}>{asText(d.label)}</span>
        <span className={`${s.badge} ${got ? s.badgeDone : d.required ? s.badgeReady : s.badgeWait}`}>
          {got ? `첨부됨 v${got.version}` : d.required ? "필수" : "선택"}
        </span>
      </div>
      {d.note && <p className={s.note}>{asText(d.note)}</p>}
      <div className={s.body}>
        <input
          ref={ref}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPick(f);
          }}
        />
        <button className="btn btn-block" disabled={busy} onClick={() => ref.current?.click()} style={{ marginTop: 12 }}>
          {got ? "다시 촬영·첨부" : "촬영·첨부"}
        </button>
        {got && (
          <div className={s.thumbWrap}>
            {preview
              ? <img className={s.thumb} src={preview} alt={`${asText(d.label)} 미리보기`} />
              : <div className={s.thumbFile}>PDF</div>}
            <div className={s.thumbMeta}>
              {Math.round(got.bytes / 1024).toLocaleString("ko-KR")}KB · {got.contentType}<br />
              {hhmm(got.receivedAt)} 제출<br />
              흐리거나 잘렸으면 다시 촬영해 주세요.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * @param payload 회원사가 보낸 계약 내용(issue payload 또는 guest view)
 * @param api     실제 계약 인스턴스에 붙일 때 넘긴다. 없으면 labs 테스트 엔드포인트로 간다.
 *                { send(key, dataUrl) · submit(state) · onConsent(key) }
 */
export default function LabEsignFlow({ payload, api = null }) {
  const [sessionId] = useState(newSessionId);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [authLabel, setAuthLabel] = useState("방법");

  const [log, setLog] = useState([]);
  const [logOpen, setLogOpen] = useState(false);

  const [verified, setVerified] = useState(null);
  const [files, setFiles] = useState({});
  const [previews, setPreviews] = useState({});
  const [seen, setSeen] = useState({});
  const [checks, setChecks] = useState({}); // 섹션 확인 시각(ms) — 불리언이 아니라 타임스탬프
  const [inputs, setInputs] = useState({});
  const [acks, setAcks] = useState({});
  const [agreed, setAgreed] = useState(false);
  const [termsRead, setTermsRead] = useState(false);
  const [cautionsAck, setCautionsAck] = useState(false);
  const [sig, setSig] = useState("");
  const [saved, setSaved] = useState(null); // 저장 결과(원자·A4·증명서 · 봉인해시)

  const pages = payload.consentPages || [];
  const inputGroups = payload.inputGroups || [];
  const allAtoms = payload.consentAtoms || [];
  const docs = payload.requiredDocs || [];
  const cautions = payload.cautions || [];

  // 수집 자체를 위한 동의(맨 앞) ↔ 계좌를 받는 자리에서 묻는 동의(계약서 06)
  const upfrontAtoms = allAtoms.filter((c) => !AT_POINT_OF_USE.has(c.group));
  const inlineAtoms = allAtoms.filter((c) => AT_POINT_OF_USE.has(c.group));

  const steps = useMemo(() => {
    const s = [];
    if (upfrontAtoms.length) s.push({ macro: "consent", kind: "consent" });
    s.push({ macro: "identity", kind: "auth" });
    s.push({ macro: "contract", kind: "contract" });
    s.push({ macro: "terms", kind: "terms" });
    if (cautions.length) s.push({ macro: "cautions", kind: "cautions" });
    s.push({ macro: "docs", kind: "docs" });
    s.push({ macro: "sign", kind: "sign" });
    s.push({ macro: "done", kind: "done" });
    return s;
  }, [upfrontAtoms.length, cautions.length]);

  const step = steps[Math.min(idx, steps.length - 1)];
  const macroIdx = MACROS.findIndex((m) => m.key === step.macro);

  const markSeen = useCallback((key) => {
    setSeen((p) => (p[key] ? p : { ...p, [key]: true }));
  }, []);

  const toggleCheck = useCallback((key, on) => {
    setChecks((prev) => {
      const nx = { ...prev };
      if (on) nx[key] = Date.now(); else delete nx[key];
      return nx;
    });
    // 단계 통과를 그때그때 서버에 남긴다 — 마지막에 몰아 저장하면
    // 손님이 중간에 이탈했을 때 어디까지 봤는지 못 남긴다.
    if (on) api?.onConsent?.(key);
  }, [api]);

  const onInput = useCallback((key, value) => setInputs((p) => ({ ...p, [key]: value })), []);
  const onAck = useCallback((key, value) => {
    setAcks((p) => ({ ...p, [key]: value }));
    api?.onAck?.(key, value);
  }, [api]);

  const send = useCallback(async (key, dataUrl) => {
    let received;
    if (api?.send) {
      received = await api.send(key, dataUrl);
    } else {
      const r = await fetch("/api/v1/labs/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, key, dataUrl }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "수신 실패");
      received = j.received;
    }
    setFiles((prev) => ({ ...prev, [key]: received }));
    setLog((prev) => [...prev, received]);
    return received;
  }, [sessionId, api]);

  const upload = useCallback(async (key, file) => {
    setBusy(true);
    setErr("");
    try {
      const dataUrl = await fileToDataUrl(file);
      setPreviews((p) => ({ ...p, [key]: dataUrl.startsWith("data:image/") ? dataUrl : "" }));
      await send(key, dataUrl);
    } catch (e) {
      setErr(e?.message || "업로드 실패");
    } finally {
      setBusy(false);
    }
  }, [send]);

  /** 기존 본인확인(AuthFlow)이 넘겨준 촬영본을 그대로 서버에 남긴다. */
  async function onVerified(v) {
    setVerified(v);
    setBusy(true);
    setErr("");
    try {
      if (v?.idImage) { setPreviews((p) => ({ ...p, idcard: v.idImage })); await send("idcard", v.idImage); }
      if (v?.faceImage) { setPreviews((p) => ({ ...p, selfie: v.faceImage })); await send("selfie", v.faceImage); }
    } catch (e) {
      setErr(e?.message || "촬영본 수신 실패");
    } finally {
      setBusy(false);
      setIdx(1);
      window.scrollTo({ top: 0 });
    }
  }

  const checkedCount = pages.filter((p) => !!checks[p.key]).length;

  const pagesLeft = pages.filter((p) => !checks[p.key]).length;
  const fieldsOk = inputGroups.every((g) => (g.fields || []).every((f) => !f.required || String(inputs[f.key] || "").trim()));
  const inlineConsentsOk = inlineAtoms.every((c) => !c.required || acks[c.key] === true);
  const upfrontConsentsOk = upfrontAtoms.every((c) => !c.required || acks[c.key] === true);
  const contractDone = pagesLeft === 0 && fieldsOk && inlineConsentsOk;

  /** 버튼이 스스로 «왜 못 누르는지» 말한다 — 진행바를 화면에 띄워둘 이유가 없다. */
  const nextLabel = (() => {
    if (step.kind === "sign") return "제출";
    if (step.kind === "consent") return upfrontConsentsOk ? "동의하고 시작" : "동의가 필요합니다";
    if (step.kind !== "contract") return "다음";
    if (pagesLeft > 0) return `${pagesLeft}개 더 확인`;
    if (!fieldsOk) return "입력이 남았습니다";
    if (!inlineConsentsOk) return "동의 선택이 남았습니다";
    return "다음";
  })();

  function canNext() {
    if (step.kind === "consent") return upfrontConsentsOk;
    if (step.kind === "contract") return contractDone;
    if (step.kind === "terms") return agreed;
    if (step.kind === "cautions") return cautionsAck;
    if (step.kind === "docs") return docs.every((d) => !d.required || !!files[d.key]);
    if (step.kind === "sign") return !!sig;
    return false;
  }

  async function next() {
    if (!canNext()) return;
    if (step.kind === "sign") {
      setBusy(true);
      try {
        // 서명이 봉인 시점이다 — 그 전에 손님이 채운 값을 서버에 올려둔다.
        await api?.beforeSign?.({ checks, inputs, acks });
        // ① 서명 이미지를 남기고 ② 계약 전체를 세 형태(원자·A4·증명서)로 저장한다.
        const sigItem = await send("signature", sig);
        const state = { checks, inputs, acks, files: { ...files, signature: sigItem } };
        if (api?.submit) {
          setSaved(await api.submit(state));
        } else {
          const r = await fetch("/api/v1/labs/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, payload, ...state }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) throw new Error(j.error || "계약 저장 실패");
          setSaved(j.saved);
        }
      } catch (e) {
        setErr(e?.message || "계약 저장 실패");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setIdx((i) => Math.min(i + 1, steps.length - 1));
    window.scrollTo({ top: 0 });
  }

  const header = (
    <FlowHeader
      title={payload.contractKind?.title || "전자계약"}
      sub={`${payload.memberCompany} · ${payload.externalRef}`}
      steps={MACROS.length}
      step={step.macro === "done" ? MACROS.length : macroIdx + 1}
      stepLabels={MACROS.map((m) => m.label)}
    />
  );

  if (step.kind === "auth") {
    return (
      <div className="app">
        {header}
        <div className="hint" style={{ padding: "0 16px 8px" }}>본인확인 · {authLabel}</div>
        <AuthFlow
          contractId={payload.contractId || ""}
          onVerified={onVerified}
          onCancel={() => setAuthLabel("방법")}
          onProgress={(p) => setAuthLabel((p || authProgress("method")).label)}
        />
        {err && <div className="auth-err" style={{ margin: "0 16px" }}>{err}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      {header}
      <div className="c-body">
        {verified && step.macro !== "done" && <VerifiedCard v={verified} />}

        {step.kind === "consent" && (
          <>
            <div className="stitle">먼저 동의가 필요합니다</div>
            <p className="sdesc">
              신분증과 얼굴 사진을 받기 전에 동의를 받습니다. 동의하지 않으시면 계약을 진행할 수 없습니다.
            </p>
            <ConsentCard atoms={upfrontAtoms} acks={acks} onAck={onAck} />
            {upfrontAtoms.some((c) => acks[c.key] === false) && (
              <div className="auth-err" style={{ marginTop: 10 }}>
                동의하지 않은 항목이 있어 계약을 진행할 수 없습니다. 담당자에게 문의해 주세요.
              </div>
            )}
          </>
        )}

        {step.kind === "cautions" && (
          <>
            <div className="stitle">아래 내용을 꼭 확인해 주세요</div>
            <p className="sdesc">계약 후 손님이 부담하게 되는 것들입니다. 자세한 내용은 약관에 있습니다.</p>
            <div className={s.card}>
              <div className={s.head}>
                <span className={s.title}>주의사항</span>
                <span className={`${s.badge} ${s.badgeReady}`}>{cautions.length}건</span>
              </div>
              <div className={s.body}>
                {cautions.map((c, i) => (
                  <Field key={i} label={asText(c.article) || `주의 ${i + 1}`} value={c.text} />
                ))}
              </div>
            </div>
            {/* 12건을 각각 체크시키면 아무도 안 읽는다 — 전체에 하나. */}
            <label className={`cc ${cautionsAck ? "on" : ""}`}>
              <input type="checkbox" checked={cautionsAck} onChange={(e) => setCautionsAck(e.target.checked)} />
              <span>위 주의사항을 모두 읽고 이해했습니다</span>
            </label>
          </>
        )}

        {step.kind === "contract" && (
          <>
            <div className="stitle">계약 내용을 확인해 주세요</div>
            <p className="sdesc">
              계약서 한 장입니다. 항목 {pages.length}개를 아래로 내려가며 확인해 주세요.
            </p>

            {pages.map((p) => (
              <ContractSection
                key={p.key}
                p={p}
                open={!!seen[p.key]}
                at={checks[p.key]}
                onSeen={() => markSeen(p.key)}
                onToggle={(on) => toggleCheck(p.key, on)}
              />
            ))}

            {inputGroups.map((g) => (
              <InputGroupBlock key={g.key} g={g} inputs={inputs} onInput={onInput} />
            ))}

            {/* CMS 동의는 계좌를 적는 이 자리에서 묻는다 — 맨 앞으로 보내지 않는다. */}
            {inlineAtoms.length > 0 && (
              <ConsentCard atoms={inlineAtoms} acks={acks} onAck={onAck} title="출금계좌 관련 동의" />
            )}
          </>
        )}

        {step.kind === "terms" && (
          <>
            <div className="stitle">약관을 끝까지 읽어 주세요</div>
            {payload.agreement?.isSample && (
              <div className="alert-box" style={{ background: "var(--navy50)", border: "1px solid var(--line)" }}>
                <b>샘플 약관</b> — 법률 검토 전 문구입니다. 실계약이 아닙니다.
              </div>
            )}

            <div className={s.card}>
              <div className={s.head}>
                <span className={s.title}>{asText(payload.agreement?.title)}</span>
                <span className={`${s.badge} ${termsRead ? s.badgeDone : s.badgeReady}`}>
                  {(payload.agreement?.sections || []).length}개조
                </span>
              </div>
              <div className={s.body}>
                <Field label="약관 버전" value={payload.agreement?.version} />
              </div>
            </div>

            {(payload.agreement?.sections || []).map((sec, i) => (
              <div className={s.art} key={i}>
                <div className={s.artT}>{asText(sec.t)}</div>
                <p className={s.artB}>{asText(sec.b)}</p>
              </div>
            ))}

            <Seen onSeen={() => setTermsRead(true)}>
              <div className={s.end}>— 약관 끝 —</div>
            </Seen>

            {!termsRead && <div className="hint" style={{ marginBottom: 8 }}>약관을 끝까지 내려 읽어 주세요.</div>}
            <label className={`cc ${agreed ? "on" : ""} ${!termsRead ? "cc-disabled" : ""}`}>
              <input type="checkbox" checked={agreed} disabled={!termsRead} onChange={(e) => setAgreed(e.target.checked)} />
              <span>{asText(payload.agreement?.confirmLabel) || "위 약관을 모두 읽고 이해했으며 이에 동의합니다"}</span>
            </label>
          </>
        )}

        {step.kind === "docs" && (
          <>
            <div className="stitle">서류를 첨부해 주세요</div>
            <p className="sdesc">필요한 것을 한 페이지에서 쭉 첨부하고 다음으로 넘어갑니다.</p>
            {docs.map((d) => (
              <DocBlock key={d.key} d={d} got={files[d.key]} preview={previews[d.key]} busy={busy} onPick={(f) => upload(d.key, f)} />
            ))}
          </>
        )}

        {step.kind === "sign" && (
          <>
            <div className="stitle">서명해 주세요</div>
            <p className="sdesc">계약은 한 건입니다. 한 번 서명하면 계약서 전체와 약관에 함께 적용됩니다.</p>
            <SignaturePad onChange={setSig} fill />
          </>
        )}

        {step.kind === "done" && (
          <>
            <div className="stitle">제출되었습니다</div>
            <p className="sdesc">담당자가 서류와 신분증을 확인한 뒤 연락드립니다. 미비한 항목은 보완 링크로 다시 요청됩니다.</p>
            <div className={s.card}>
              <div className={s.head}><span className={s.title}>이번에 서버가 받은 것</span></div>
              <div className={s.body}>
                <Field label="파일" value={`${log.length}건`} />
                <Field label="섹션 확인" value={`${checkedCount} / ${pages.length}`} />
                <Field label="입력값" value={`${Object.keys(inputs).filter((k) => String(inputs[k] || "").trim()).length}건`} />
                <Field label="개인정보 동의" value={`${Object.values(acks).filter((v) => v === true).length}건 동의`} />
              </div>
            </div>

            {saved && (
              <div className={s.card}>
                <div className={s.head}>
                  <span className={s.title}>계약서 저장</span>
                  <span className={`${s.badge} ${saved.store === "firestore" ? s.badgeDone : s.badgeWait}`}>
                    {saved.store === "firestore" ? "Firestore" : "파일(자격 없음)"}
                  </span>
                </div>
                <div className={s.body}>
                  <Field label="계약 번호" value={saved.contractId} />
                  <Field label="봉인 해시" value={saved.sealHash} />
                  <Field label="원자용 계약서" value={`항목 ${saved.counts.atoms}개 · 확인 ${saved.counts.confirmed}건`} />
                  <Field label="A4용 계약서" value={`섹션 ${saved.counts.a4Sections}개 · 약관 ${saved.counts.articles}개조`} />
                  <Field label="증명서용" value={saved.certificate?.verifyNo} />
                  <Field label="저장 위치" value={saved.path} />
                </div>
              </div>
            )}
          </>
        )}

        {err && <div className="auth-err" style={{ marginTop: 10 }}>{err}</div>}

        {/* 테스트용 — 손님 화면에 있을 것이 아니다. 설계 단계에서 담당자 콘솔로 옮긴다. */}
        <div className="panel" style={{ marginTop: 18 }}>
          <div
            className="panel-head"
            style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}
            onClick={() => setLogOpen((v) => !v)}
          >
            <span>[테스트] 서버 수신 로그 ({log.length})</span>
            <span className="hint">{logOpen ? "접기" : "펼치기"}</span>
          </div>
          {logOpen && (
            log.length === 0
              ? <p className="sdesc" style={{ margin: 0 }}>아직 받은 파일이 없습니다.</p>
              : log.map((it, i) => (
                <div className="receipt" key={i} style={{ marginBottom: 8 }}>
                  <div className="r"><span className="k">항목</span><span className="v mono">{it.key} · v{it.version}</span></div>
                  <div className="r"><span className="k">저장 경로</span><span className="v mono" style={{ wordBreak: "break-all" }}>{it.storagePath}</span></div>
                  <div className="r"><span className="k">크기 · 형식</span><span className="v mono">{it.bytes.toLocaleString("ko-KR")}B · {it.contentType}</span></div>
                  <div className="r"><span className="k">sha256</span><span className="v mono" style={{ wordBreak: "break-all" }}>{it.sha256.slice(0, 32)}…</span></div>
                  <div className="r"><span className="k">수신 시각</span><span className="v mono">{new Date(it.receivedAt).toLocaleString("ko-KR")}</span></div>
                </div>
              ))
          )}
        </div>
      </div>

      {step.kind !== "done" && (
        <StepFooter
          prev={idx > 1 ? { onClick: () => { setIdx((i) => Math.max(1, i - 1)); window.scrollTo({ top: 0 }); }, disabled: busy } : null}
          next={{ label: nextLabel, onClick: next, disabled: busy || !canNext() }}
        />
      )}
    </div>
  );
}
