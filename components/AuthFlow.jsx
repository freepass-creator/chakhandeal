"use client";

import { useState, useRef, useEffect } from "react";
import { hyphenPhone, fmtBirth } from "@/lib/format";
import { CARRIERS, DEMO_MODE } from "@/lib/constants";
import { requestPhoneCode, verifyPhoneCode } from "@/lib/kyc/phoneProvider";
import { DEMO_USERS, DEMO_IMG, demoVerified } from "@/lib/demo";
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

// 본인확인 — onProgress로 헤더 진행바 연동
// onVerified({ name, birth(6), phone, method, idImage, faceImage })
// personas: 시연 샘플 칩 (DEMO_USERS 키) — 업종 맥락에 맞는 '이력 있음' 사례를 노출
export default function AuthFlow({ onVerified, onCancel, supportHelp = null, onProgress = null, personas = ["clean", "hit"] }) {
  // method=방법 선택 | (신분증) idcam·ocr·review·manual·selfie | (휴대폰) phone·phonecode | done
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

  async function runOcr() {
    if (!idImage) return;
    setStage("ocr");
    try {
      const fd = new FormData();
      fd.append("file", dataUrlToBlob(idImage), "id.jpg");
      const r = await fetch("/api/ocr/id", { method: "POST", body: fd });
      const j = await r.json();
      // OCR은 '자동 채움' 편의일 뿐 게이트가 아님 — 사진(촬영)이 본인확인의 핵심.
      // 잘 읽으면 review(확인), 못 읽어도 촬영본은 유지한 채 manual(직접 입력)로 진행(우회 가능).
      if (j.ok && j.name && j.birth && j.birth.replace(/\D/g, "").length === 6) {
        setOcrUsed(true);
        setA({ name: j.name, birth: j.birth, phone: "" });
        setStage("review");
      } else { setOcrFail(true); setStage("manual"); }   // 사진 유지(setIdImage 안 지움)
    } catch { setOcrFail(true); setStage("manual"); }
  }

  const phoneOk = a.phone.replace(/\D/g, "").length >= 10;
  const allOk = a.name.trim() && a.birth.replace(/\D/g, "").length >= 6 && phoneOk;
  function toSelfie() { if (!allOk) { alert("이름 · 생년월일 6자리 · 휴대폰번호를 확인해 주세요."); return; } setStage("selfie"); }
  function finish() {
    if (!faceImage) { alert("본인 얼굴을 촬영해 주세요."); return; }
    setStage("done");
    setTimeout(() => onVerified({
      name: a.name.trim(),
      birth: a.birth.replace(/\D/g, "").slice(0, 6),
      phone: a.phone,
      method: ocrUsed ? "신분증 OCR + 얼굴 대조" : "신분증 + 얼굴 대조",
      idImage,
      faceImage,
    }), 600);
  }
  // 휴대폰 본인인증 — phoneProvider stub. PASS/통신사 연동 시 해당 모듈만 교체.
  const phoneFormOk = a.name.trim() && a.birth.replace(/\D/g, "").length >= 6 && carrier && phoneOk;
  async function startPhoneCode() {
    const res = await requestPhoneCode({ phone: a.phone, name: a.name.trim(), birth: a.birth, carrier });
    if (!res.ok) { alert(res.error || "인증번호 요청 실패"); return; }
    setPhoneTxId(res.txId || "");
    setCode("");
    setStage("phonecode");
  }
  async function finishPhone() {
    const res = await verifyPhoneCode({ txId: phoneTxId, code });
    if (!res.ok) { alert(res.error || "인증 실패"); return; }
    setStage("done");
    setTimeout(() => onVerified({
      name: a.name.trim(),
      birth: a.birth.replace(/\D/g, "").slice(0, 6),
      phone: a.phone,
      method: "휴대폰 본인인증",
      idImage: "",
      faceImage: "",
    }), 600);
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
          {DEMO_MODE && (
            <div className="demo-banner">
              <strong>시연 모드</strong>
              <span>실제 PASS·문자 인증은 아직 연결되지 않았습니다. 아래 샘플로 바로 체험할 수 있어요.</span>
            </div>
          )}
          <button type="button" className="auth-opt rec" onClick={() => { setOcrFail(false); setStage("idcam"); }}>
            <span className="ic id"><Icon name="file" size={18} /></span>
            <span className="tx">신분증으로 인증<small>신분증 촬영 + 얼굴 촬영 · 온라인 대면 · 권장</small></span>
            <span className="arr">›</span>
          </button>
          <button type="button" className="auth-opt" onClick={() => setStage("phone")}>
            <span className="ic phone"><Icon name="phone" size={18} /></span>
            <span className="tx">휴대폰으로 인증<small>{DEMO_MODE ? "시연 · 실제 문자는 보내지 않음" : "PASS·통신사 본인확인"}</small></span>
            <span className="arr">›</span>
          </button>
          {DEMO_MODE && (
            <div className="demo-chips" style={{ marginTop: 12 }}>
              {personas.filter((k) => DEMO_USERS[k]).map((k) => (
                <button key={k} type="button" className={`demo-chip ${k === "clean" ? "safe" : ""}`} onClick={() => {
                  setStage("done");
                  setTimeout(() => onVerified(demoVerified(k)), 400);
                }}>{DEMO_USERS[k].label}</button>
              ))}
            </div>
          )}
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
          {DEMO_MODE && !idImage && (
            <button type="button" className="text-link" onClick={() => {
              const u = DEMO_USERS.clean;
              setIdImage(DEMO_IMG);
              setA({ name: u.name, birth: u.birth, phone: u.phone });
              setOcrFail(false);
              setStage("manual");
            }}>시연 · 카메라 없이 샘플로 진행</button>
          )}
        </div>
        <StepFooter prev={{ onClick: () => { setOcrFail(false); setStage("method"); } }} next={idImage ? { label: "다음", onClick: runOcr } : { label: "● 촬영", onClick: () => { if (!camRef.current?.capture()) alert("카메라가 준비되면 다시 눌러 주세요."); } }} />
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
        <StepFooter prev={{ onClick: () => { setIdImage(""); setStage("idcam"); } }} next={{ label: "네, 맞습니다", disabled: !allOk, onClick: toSelfie }} />
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
        <StepFooter prev={{ onClick: () => { if (!ocrUsed) setIdImage(""); setOcrFail(false); setStage(ocrUsed ? "review" : "idcam"); } }} next={{ label: "다음", disabled: !allOk, onClick: toSelfie }} />
      </>
    );

  if (stage === "phone")
    return (
      <>
        <div className="c-body anim-in" key={stage}>
          <div className="slabel">휴대폰 본인인증</div>
          <div className="stitle">휴대폰으로 본인인증</div>
          {DEMO_MODE ? (
            <>
              <div className="demo-banner">
                <strong>시연 모드 · 문자는 발송되지 않습니다</strong>
                <span>PASS·통신사 연동 전입니다. 샘플로 채운 뒤, 인증번호는 아무 6자리나 입력하면 통과합니다.</span>
              </div>
              <div className="demo-chips">
                <button type="button" className="demo-chip safe" onClick={() => {
                  const u = DEMO_USERS.clean;
                  setA({ name: u.name, birth: u.birth, phone: u.phone });
                  setCarrier(CARRIERS[0] || "SKT");
                }}>샘플 채우기</button>
              </div>
            </>
          ) : (
            <div className="sdesc">PASS·통신사 연동 준비 중입니다. 신분증·얼굴 인증을 이용해 주세요.</div>
          )}
          <div className="field"><label>이름</label><input value={a.name} onChange={set("name")} placeholder="홍길동" disabled={!DEMO_MODE} /></div>
          <div className="field"><label>생년월일 6자리</label><input value={a.birth} onChange={set("birth")} inputMode="numeric" maxLength={6} placeholder="900715" disabled={!DEMO_MODE} /></div>
          <div className="field"><label>통신사</label><select value={carrier} onChange={(e) => setCarrier(e.target.value)} disabled={!DEMO_MODE}><option value="">선택</option>{CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field"><label>휴대폰번호</label><input value={a.phone} onChange={setPhone} inputMode="numeric" placeholder="010-0000-0000" disabled={!DEMO_MODE} /></div>
        </div>
        <StepFooter prev={{ onClick: () => setStage("method") }} next={DEMO_MODE ? { label: "인증번호 요청", disabled: !phoneFormOk, onClick: startPhoneCode } : undefined} />
      </>
    );

  if (stage === "phonecode")
    return (
      <>
        <div className="c-body anim-in" key={stage}>
          <div className="slabel">휴대폰 본인인증</div>
          <div className="stitle">인증번호 입력</div>
          <div className="demo-banner">
            <strong>시연 · 실제 문자는 오지 않습니다</strong>
            <span>아무 6자리, 또는 아래 샘플을 누르면 됩니다.</span>
          </div>
          <div className="field"><label>인증번호</label><input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="000000" /></div>
          {DEMO_MODE && (
            <div className="demo-chips">
              <button type="button" className="demo-chip" onClick={() => setCode("123456")}>샘플 123456</button>
            </div>
          )}
          <button type="button" className="text-link" onClick={startPhoneCode}>다시 요청</button>
        </div>
        <StepFooter prev={{ onClick: () => setStage("phone") }} next={{ label: "인증 완료", disabled: code.length !== 6, onClick: finishPhone }} />
      </>
    );

  // stage === "selfie"
  return (
    <>
      <div className="c-body anim-in" key={stage} style={{ display: "flex", flexDirection: "column", paddingBottom: 6 }}>
        <div className="slabel">얼굴 촬영</div>
        <div className="stitle">본인 얼굴을 촬영해 주세요</div>
        <div className="sdesc" style={{ marginBottom: 10 }}>신분증과 같은 사람인지 확인합니다. 얼굴을 틀 안에 맞춰 주세요.</div>
        <div style={{ flex: 1, minHeight: 200 }}>
          <CameraCapture ref={camRef} facing="user" max={720} onCapture={setFaceImage} guide="얼굴을 틀 안에 맞춰 주세요" />
        </div>
        {DEMO_MODE && !faceImage && (
          <button type="button" className="text-link" onClick={() => setFaceImage(DEMO_IMG)}>시연 · 카메라 없이 샘플 얼굴</button>
        )}
      </div>
      <StepFooter prev={{ onClick: () => setStage(ocrUsed ? "review" : "manual") }} next={faceImage ? { label: "본인확인 완료", onClick: finish } : { label: "● 촬영", onClick: () => { if (!camRef.current?.capture()) alert("카메라가 준비되면 다시 눌러 주세요."); } }} />
    </>
  );
}

// dataURL → Blob (OCR 전송용)
function dataUrlToBlob(url) {
  const [meta, b64] = url.split(",");
  const mime = (meta.match(/:(.*?);/) || [])[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
