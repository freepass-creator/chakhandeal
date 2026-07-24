"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signup } from "@/lib/auth";
import { VERTICALS, DEFAULT_VERTICAL } from "@/lib/constants";
import Icon from "@/components/Icon";
import FlowHeader from "@/components/FlowHeader";
import StepFooter from "@/components/StepFooter";

export default function SignupPage() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [service, setService] = useState("");
  const [vertical, setVertical] = useState(DEFAULT_VERTICAL);
  const [bizNo, setBizNo] = useState("");
  const [ceo, setCeo] = useState("");
  const [industry, setIndustry] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [bizImage, setBizImage] = useState("");
  const [bizName, setBizName] = useState("");
  const [ceoIdImage, setCeoIdImage] = useState("");
  const [ceoIdName, setCeoIdName] = useState("");
  const [ocr, setOcr] = useState("");   // "" | loading | done | fail
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onBiz(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBizName(f.name);
    setBizImage(await fileToDataUrl(f));
    setOcr("loading");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/ocr/biz", { method: "POST", body: fd });
      const j = await r.json();
      if (j.ok && (j.company || j.bizNo)) {
        if (j.company) setCompany(j.company);
        if (j.bizNo) setBizNo(j.bizNo);
        if (j.ceo) setCeo(j.ceo);
        if (j.industry) { setIndustry(j.industry); setService((s) => s || j.industry.split(",")[0].trim()); }
        setOcr("done");
      } else setOcr("fail");
    } catch { setOcr("fail"); }
  }
  async function onCeoId(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCeoIdName(f.name);
    setCeoIdImage(await fileToDataUrl(f));
  }

  async function submit() {
    setErr("");
    if (!bizImage) { setErr("사업자등록증을 첨부해 주세요."); return; }
    if (!company.trim()) { setErr("회사명을 확인해 주세요."); return; }
    if (!service.trim()) { setErr("업종을 입력해 주세요."); return; }
    if (!ceoIdImage) { setErr("대표자 신분증을 첨부해 주세요."); return; }
    if (!email.trim()) { setErr("이메일을 입력해 주세요."); return; }
    if (pw.length < 6) { setErr("비밀번호는 6자 이상이어야 합니다."); return; }
    if (pw !== pw2) { setErr("비밀번호가 일치하지 않습니다."); return; }
    setBusy(true);
    const r = await signup({ company, email, pw, bizImage, ceoIdImage, service, bizNo, ceo, industry, vertical });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setDone(true);
  }

  if (done)
    return (
      <div className="app">
        <FlowHeader title="가입 신청 완료" sub="관리자 승인 후 이용할 수 있습니다" />
        <div className="c-body c-center">
          <div className="done">
            <div className="big">✓</div>
            <h2>가입 신청이 접수되었습니다</h2>
            <p>제출하신 사업자등록증·대표자 신분증을<br />관리자가 확인 후 승인합니다.<br />승인되면 거래코드가 발급되고 로그인할 수 있어요.</p>
          </div>
        </div>
        <StepFooter next={{ label: "로그인 화면으로", onClick: () => router.replace("/login") }} />
      </div>
    );

  return (
    <div className="app">
      <FlowHeader title="회원사 가입" sub="사업자등록증·대표자 신분증 확인 후 승인됩니다" />
      <div className="c-body">
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="field">
            <label>사업자등록증 <span className="req">*</span> <span className="opt">올리면 회사정보를 자동으로 읽어요</span></label>
            <label className="btn btn-block" style={{ cursor: "pointer" }}>
              <Icon name="file" /> {bizName || "사업자등록증 촬영·첨부"}
              <input type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={onBiz} />
            </label>
            {ocr === "loading" && <div className="hint">사업자등록증을 읽는 중…</div>}
            {ocr === "done" && <div className="hint" style={{ color: "#0f7f5b" }}>✓ 회사정보를 자동으로 채웠어요. 틀리면 고쳐 주세요.</div>}
            {ocr === "fail" && <div className="hint">자동 인식이 안 됐어요. 아래에 직접 입력해 주세요.</div>}
          </div>
          <div className="field"><label>회사·상호명 <span className="req">*</span></label><input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="예: 스피드렌탈" /></div>
          <div className="field"><label>사업자등록번호</label><input value={bizNo} onChange={(e) => setBizNo(e.target.value)} placeholder="000-00-00000" /></div>
          <div className="field"><label>대표자</label><input value={ceo} onChange={(e) => setCeo(e.target.value)} placeholder="대표자 성명" /></div>
          <div className="field"><label>업종 카테고리 <span className="req">*</span></label>
            <select value={vertical} onChange={(e) => {
              const v = e.target.value;
              setVertical(v);
              const meta = VERTICALS[v];
              if (meta && !service.trim()) setService(meta.label);
            }}>
              {Object.values(VERTICALS).map((v) => (
                <option key={v.id} value={v.id}>{v.label} ({v.brandEn})</option>
              ))}
            </select>
          </div>
          <div className="field"><label>업종(서비스) <span className="req">*</span> <span className="opt">손님 화면에 표시됩니다</span></label>
            <input value={service} onChange={(e) => setService(e.target.value)} placeholder="예: 렌탈" list="svc-list" />
            <datalist id="svc-list"><option value="렌탈" /><option value="반려 분양" /><option value="식당" /><option value="숙박" /></datalist></div>
          <div className="field">
            <label>대표자 신분증 <span className="req">*</span> <span className="opt">촬영으로 첨부</span></label>
            <label className="btn btn-block" style={{ cursor: "pointer" }}>
              <Icon name="file" /> {ceoIdImage ? "대표자 신분증 촬영됨 ✓" : "대표자 신분증 촬영"}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onCeoId} />
            </label>
          </div>
          <div className="field"><label>이메일(로그인 ID) <span className="req">*</span></label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com" /></div>
          <div className="field"><label>비밀번호 <span className="req">*</span></label><input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="6자 이상" autoComplete="new-password" /></div>
          <div className="field"><label>비밀번호 확인 <span className="req">*</span></label><input value={pw2} onChange={(e) => setPw2(e.target.value)} type="password" placeholder="비밀번호 다시 입력" autoComplete="new-password" /></div>
          <div className="hint">제출하신 서류는 회원 자격 확인 용도로만 사용되며 암호화 보관됩니다.</div>
          {err && <div className="auth-err">{err}</div>}
        </form>
        <div className="auth-alt">이미 계정이 있으신가요? <a href="/login">로그인</a></div>
      </div>
      <StepFooter prev={{ label: "이전", onClick: () => router.push("/login") }} next={{ label: busy ? "신청 중…" : "가입 신청", onClick: submit, disabled: busy }} />
    </div>
  );
}

// 파일 → dataURL (이미지는 1400px 축소 JPEG, PDF 등은 원본)
function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      if (!String(file.type).startsWith("image/")) { resolve(r.result); return; }
      const img = new Image();
      img.onload = () => {
        const max = 1400, scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => resolve(r.result);
      img.src = r.result;
    };
    r.onerror = () => resolve("");
    r.readAsDataURL(file);
  });
}
