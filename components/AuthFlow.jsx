"use client";

import { useState, useRef, useEffect } from "react";
import { hyphenPhone, fmtBirth } from "@/lib/format";
import { CARRIERS, DEMO_MODE } from "@/lib/constants";
import { requestPhoneCode, verifyPhoneCode } from "@/lib/kyc/phoneProvider";
import { DEMO_USERS, DEMO_IMG } from "@/lib/demo";
import StepFooter from "@/components/StepFooter";
import CameraCapture from "@/components/CameraCapture";
import Icon from "@/components/Icon";

/** 본인확인 내부 단계 → 진행바 (4칸) */
export function authProgress(stage) {
  switch (stage) {
    case "method": return { step: 1, label: "방법" };
    case "idcam":
    case "ocr":
    case "phone": return { step: 2, label: "인증" };
    case "review":
    case "manual":
    case "phonecode": return { step: 3, label: "확인" };
    case "selfie":
    case "done": return { step: 4, label: "완료" };
    default: return { step: 1, label: "방법" };
  }
}

function fillDemoIdentity() {
  const u = DEMO_USERS.clean;
  return { name: u.name, birth: u.birth, phone: u.phone };
}

// 본인확인 — DEMO_MODE면 UI에 티 내지 않고, 비어 있어도 다음으로 통과
export default function AuthFlow({ onVerified, onCancel, supportHelp = null, onProgress = null }) {
  const [stage, setStage] = useState("method");
  const [ocrUsed, setOcrUsed] = useState(false);
  const [ocrFail, setOcrFail] = useState(false);
  const [a, setA] = useState({ name: "", birth: "", phone: "" });
  const [carrier, setCarrier] = useState("");
  const [code, setCode] = useState("");
  const [phoneTxId, setPhoneTxId] = useState("");
  const [idImage, setIdImage] = useState("");
  const [faceImage, setFaceImage] = useState("");
  const set = (k) => (e) => setA((s) => ({ ...s, [k]: e.target.value }));
  const setPhone = (e) => setA((s) => ({ ...s, phone: hyphenPhone(e.target.value) }));
  const camRef = useRef(null);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useEffect(() => {
    progressRef.current?.(authProgress(stage));
  }, [stage]);

  // 휴대폰 화면 진입 시 조용히 채움 (시연 티 없음)
  useEffect(() => {
    if (!DEMO_MODE || stage !== "phone") return;
    setA((s) => {
      if (s.name && s.birth && s.phone) return s;
      return fillDemoIdentity();
    });
    setCarrier((c) => c || CARRIERS[0] || "SKT");
  }, [stage]);

  async function runOcr() {
    if (!idImage) return;
    setStage("ocr");
    try {
      const fd = new FormData();
      fd.append("file", dataUrlToBlob(idImage), "id.jpg");
      const r = await fetch("/api/ocr/id", { method: "POST", body: fd });
      const j = await r.json();
      if (j.ok && j.name && j.birth && j.birth.replace(/\D/g, "").length === 6) {
        setOcrUsed(true);
        setA((s) => ({ ...s, name: j.name, birth: j.birth, phone: s.phone || fillDemoIdentity().phone }));
        setStage("review");
      } else {
        if (DEMO_MODE) {
          const d = fillDemoIdentity();
          setA((s) => ({ name: s.name || d.name, birth: s.birth || d.birth, phone: s.phone || d.phone }));
        }
        setOcrFail(true);
        setStage("manual");
      }
    } catch {
      if (DEMO_MODE) {
        const d = fillDemoIdentity();
        setA((s) => ({ name: s.name || d.name, birth: s.birth || d.birth, phone: s.phone || d.phone }));
      }
      setOcrFail(true);
      setStage("manual");
    }
  }

  function ensureIdentity() {
    const d = fillDemoIdentity();
    const next = {
      name: a.name.trim() || (DEMO_MODE ? d.name : ""),
      birth: (a.birth.replace(/\D/g, "").slice(0, 6) || (DEMO_MODE ? d.birth : "")),
      phone: a.phone.replace(/\D/g, "").length >= 10 ? a.phone : (DEMO_MODE ? d.phone : a.phone),
    };
    setA(next);
    return next;
  }

  function toSelfie() {
    const id = ensureIdentity();
    if (!id.name || id.birth.length < 6 || id.phone.replace(/\D/g, "").length < 10) {
      if (!DEMO_MODE) { alert("이름 · 생년월일 6자리 · 휴대폰번호를 확인해 주세요."); return; }
    }
    setStage("selfie");
  }

  function finish(face = faceImage) {
    const id = ensureIdentity();
    const faceOk = face || (DEMO_MODE ? DEMO_IMG : "");
    if (!faceOk) { alert("본인 얼굴을 촬영해 주세요."); return; }
    if (!face) setFaceImage(faceOk);
    setStage("done");
    setTimeout(() => onVerified({
      name: id.name,
      birth: id.birth.slice(0, 6),
      phone: id.phone,
      method: ocrUsed ? "신분증 OCR + 얼굴 대조" : "신분증 + 얼굴 대조",
      idImage: idImage || (DEMO_MODE ? DEMO_IMG : ""),
      faceImage: faceOk,
    }), 600);
  }

  async function startPhoneCode() {
    const id = ensureIdentity();
    const car = carrier || CARRIERS[0] || "SKT";
    if (!carrier) setCarrier(car);
    if (!DEMO_MODE && (!id.name || id.birth.length < 6 || !car || id.phone.replace(/\D/g, "").length < 10)) {
      alert("입력 내용을 확인해 주세요.");
      return;
    }
    const res = await requestPhoneCode({ phone: id.phone, name: id.name, birth: id.birth, carrier: car });
    if (!res.ok) { alert(res.error || "인증번호 요청 실패"); return; }
    setPhoneTxId(res.txId || "");
    setCode("");
    setStage("phonecode");
  }

  async function finishPhone() {
    let digits = code.replace(/\D/g, "");
    if (DEMO_MODE && digits.length < 6) digits = (digits + "000000").slice(0, 6);
    const res = await verifyPhoneCode({ txId: phoneTxId, code: digits });
    if (!res.ok) { alert(res.error || "인증 실패"); return; }
    const id = ensureIdentity();
    setStage("done");
    setTimeout(() => onVerified({
      name: id.name,
      birth: id.birth.slice(0, 6),
      phone: id.phone,
      method: "휴대폰 본인인증",
      idImage: "",
      faceImage: "",
    }), 600);
  }

  function captureId() {
    if (camRef.current?.capture()) return;
    if (!DEMO_MODE) { alert("카메라가 준비되면 다시 눌러 주세요."); return; }
    const d = fillDemoIdentity();
    setIdImage(DEMO_IMG);
    setA(d);
    setOcrFail(false);
    setStage("manual");
  }

  function captureFace() {
    if (camRef.current?.capture()) return;
    if (!DEMO_MODE) { alert("카메라가 준비되면 다시 눌러 주세요."); return; }
    finish(DEMO_IMG);
  }

  if (stage === "ocr" || stage === "done")
    return (
      <>
        <div className="c-body anim-in" key={stage}><div className="verifying"><div className="spinner" /><div style={{ fontWeight: 700, fontSize: 15 }}>{stage === "ocr" ? "신분증을 확인하는 중…" : "본인확인 처리 중…"}</div></div></div>
        <div className="c-footer"><button className="btn btn-block" disabled>처리 중…</button></div>
      </>
    );

  if (stage === "method")
    return (
      <>
        <div className="c-body anim-in" key={stage}>
          <div className="slabel">본인확인</div>
          <div className="stitle">본인확인을 진행해 주세요</div>
          <div className="sdesc">신분증과 얼굴을 촬영하면 온라인 대면으로 본인확인이 됩니다. 권장 방식입니다.</div>
          <button type="button" className="auth-opt rec" onClick={() => { setOcrFail(false); setStage("idcam"); }}>
            <span className="ic id"><Icon name="file" size={18} /></span>
            <span className="tx">신분증으로 인증<small>신분증 촬영 + 얼굴 촬영 · 온라인 대면 · 권장</small></span>
            <span className="arr">›</span>
          </button>
          <button type="button" className="auth-opt" onClick={() => setStage("phone")}>
            <span className="ic phone"><Icon name="phone" size={18} /></span>
            <span className="tx">휴대폰으로 인증<small>PASS·통신사 본인확인</small></span>
            <span className="arr">›</span>
          </button>
          {supportHelp}
        </div>
        <StepFooter prev={{ onClick: onCancel }} />
      </>
    );

  if (stage === "idcam")
    return (
      <>
        <div className="c-body anim-in" key={stage} style={{ display: "flex", flexDirection: "column", paddingBottom: 6 }}>
          <div className="slabel">신분증 촬영</div>
          <div className="stitle">신분증을 촬영해 주세요</div>
          <div className="sdesc" style={{ marginBottom: 10 }}>가로 틀에 맞춰 촬영하면 이름·생년월일을 자동으로 읽어요. 본인확인의 핵심 단계입니다.</div>
          {ocrFail && (
            <div className="alert-box danger">
              글자가 또렷하게 읽히지 않았어요. 빛 반사 없이 가로 틀에 꽉 차게 다시 촬영해 주세요.
            </div>
          )}
          <div style={{ flex: 1, minHeight: 200 }}>
            <CameraCapture ref={camRef} facing="environment" max={1100} onCapture={(u) => { setIdImage(u); if (u) setOcrFail(false); }} guide="신분증을 가로 틀에 꽉 차게" />
          </div>
        </div>
        <StepFooter
          prev={{ onClick: () => { setOcrFail(false); setStage("method"); } }}
          next={idImage ? { label: "다음", onClick: runOcr } : { label: "● 촬영", onClick: captureId }}
        />
      </>
    );

  if (stage === "review")
    return (
      <>
        <div className="c-body anim-in" key={stage}>
          <div className="slabel">정보 확인</div>
          <div className="stitle">이 정보가 맞으세요?</div>
          <div className="sdesc">신분증에서 읽은 내용이에요. 다르면 아래 ‘직접 입력’으로 고쳐 주세요.</div>
          <div className="verified">
            <div className="vrow"><span className="chk">✓</span> 신분증에서 읽음</div>
            <div className="info"><span>이름 <b>{a.name || "—"}</b></span><span>생년월일 {a.birth ? fmtBirth(a.birth) : "—"}</span></div>
          </div>
          <div className="field"><label>휴대폰번호</label><input value={a.phone} onChange={setPhone} inputMode="numeric" placeholder="010-0000-0000" /></div>
          <button type="button" className="text-link" onClick={() => setStage("manual")}>정보가 다른가요? 직접 입력하기</button>
        </div>
        <StepFooter prev={{ onClick: () => { setIdImage(""); setStage("idcam"); } }} next={{ label: "네, 맞습니다", onClick: toSelfie }} />
      </>
    );

  if (stage === "manual")
    return (
      <>
        <div className="c-body anim-in" key={stage}>
          <div className="slabel">{ocrUsed ? "정보 보정" : "정보 입력"}</div>
          <div className="stitle">{ocrUsed ? "잘못 읽힌 부분을 고쳐 주세요" : "이름·생년월일을 입력해 주세요"}</div>
          <div className="sdesc">{ocrUsed
            ? "신분증에서 읽은 정보예요. 다른 부분만 신분증과 동일하게 고쳐 주세요."
            : "신분증은 촬영됐어요. 글자를 자동으로 못 읽어, 신분증과 동일하게 직접 입력해 주세요."}</div>
          <div className="field"><label>이름</label><input value={a.name} onChange={set("name")} placeholder="홍길동" /></div>
          <div className="field"><label>생년월일 6자리</label><input value={a.birth} onChange={set("birth")} inputMode="numeric" maxLength={6} placeholder="900715" /></div>
          <div className="field"><label>휴대폰번호</label><input value={a.phone} onChange={setPhone} inputMode="numeric" placeholder="010-0000-0000" /></div>
          {!ocrUsed && <button type="button" className="text-link" onClick={() => { setOcrFail(false); setIdImage(""); setStage("idcam"); }}>신분증을 다시 촬영할게요</button>}
          {supportHelp}
        </div>
        <StepFooter prev={{ onClick: () => { if (!ocrUsed) setIdImage(""); setOcrFail(false); setStage(ocrUsed ? "review" : "idcam"); } }} next={{ label: "다음", onClick: toSelfie }} />
      </>
    );

  if (stage === "phone")
    return (
      <>
        <div className="c-body anim-in" key={stage}>
          <div className="slabel">휴대폰 본인인증</div>
          <div className="stitle">휴대폰으로 본인인증</div>
          <div className="sdesc">본인 명의 휴대폰으로 인증을 진행해 주세요.</div>
          <div className="field"><label>이름</label><input value={a.name} onChange={set("name")} placeholder="홍길동" /></div>
          <div className="field"><label>생년월일 6자리</label><input value={a.birth} onChange={set("birth")} inputMode="numeric" maxLength={6} placeholder="900715" /></div>
          <div className="field"><label>통신사</label><select value={carrier} onChange={(e) => setCarrier(e.target.value)}><option value="">선택</option>{CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field"><label>휴대폰번호</label><input value={a.phone} onChange={setPhone} inputMode="numeric" placeholder="010-0000-0000" /></div>
        </div>
        <StepFooter prev={{ onClick: () => setStage("method") }} next={{ label: "인증번호 요청", onClick: startPhoneCode }} />
      </>
    );

  if (stage === "phonecode")
    return (
      <>
        <div className="c-body anim-in" key={stage}>
          <div className="slabel">휴대폰 본인인증</div>
          <div className="stitle">인증번호 입력</div>
          <div className="sdesc">문자로 받은 인증번호 6자리를 입력해 주세요.</div>
          <div className="field"><label>인증번호</label><input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="000000" /></div>
          <button type="button" className="text-link" onClick={startPhoneCode}>다시 요청</button>
        </div>
        <StepFooter prev={{ onClick: () => setStage("phone") }} next={{ label: "인증 완료", onClick: finishPhone }} />
      </>
    );

  return (
    <>
      <div className="c-body anim-in" key={stage} style={{ display: "flex", flexDirection: "column", paddingBottom: 6 }}>
        <div className="slabel">얼굴 촬영</div>
        <div className="stitle">본인 얼굴을 촬영해 주세요</div>
        <div className="sdesc" style={{ marginBottom: 10 }}>신분증과 같은 사람인지 확인합니다. 얼굴을 틀 안에 맞춰 주세요.</div>
        <div style={{ flex: 1, minHeight: 200 }}>
          <CameraCapture ref={camRef} facing="user" max={720} onCapture={setFaceImage} guide="얼굴을 틀 안에 맞춰 주세요" />
        </div>
      </div>
      <StepFooter
        prev={{ onClick: () => setStage(ocrUsed ? "review" : "manual") }}
        next={faceImage ? { label: "본인확인 완료", onClick: () => finish() } : { label: "● 촬영", onClick: captureFace }}
      />
    </>
  );
}

function dataUrlToBlob(url) {
  const [meta, b64] = url.split(",");
  const mime = (meta.match(/:(.*?);/) || [])[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
