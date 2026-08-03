"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FlowHeader from "@/components/FlowHeader";
import StepFooter from "@/components/StepFooter";
import { fmtDateTime } from "@/lib/format";

/** 상태 링크 확인 — 카톡·문자·복사로 받은 URL */
export default function VerifyLinkPage() {
  const router = useRouter();
  const [cert, setCert] = useState(null);
  const [err, setErr] = useState("");
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id") || "";
    if (!id) { setErr("확인 링크가 올바르지 않습니다."); setLoading(false); return; }
    fetch(`/api/v1/cert?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.status === 410 || j.code === "EXPIRED" || j.expired) {
          setExpired(true);
          setErr(j.error || "유효기간이 지난 링크입니다.");
          return;
        }
        if (j.ok) setCert(j.cert);
        else setErr(j.error || "상태 정보를 찾을 수 없습니다.");
      })
      .catch(() => setErr("조회 중 오류가 발생했습니다."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app">
      <FlowHeader title="상태 링크 확인" sub="받은 링크 · 서버 실시간 결과" steps={1} step={1} />
      <div className="c-body">
        {loading && (
          <div className="verifying" style={{ paddingTop: 48 }}>
            <div className="spinner" />
            <div style={{ fontWeight: 700, fontSize: 15 }}>상태를 확인하는 중…</div>
          </div>
        )}
        {err && !loading && (
          <div className="done" style={{ paddingTop: 24 }}>
            <div className="big" style={{ background: "var(--danger50)", color: "var(--danger)" }}>{expired ? "!" : "?"}</div>
            <h2>{expired ? "링크가 만료되었습니다" : "확인할 수 없습니다"}</h2>
            <p>{err}</p>
            <p className="sdesc">상대에게 새 상태 링크를 다시 받아 주세요.</p>
          </div>
        )}
        {cert && (
          <>
            <div className="slabel">링크 확인됨</div>
            <div className="stitle">{cert.certName || "착한딜 상태"}</div>
            <div className="sdesc">
              이용자가 직접 확인한 뒤 보낸 링크입니다. 화면 캡처·복사본이 아니라 <b>이 페이지의 실시간 결과</b>만 보시면 됩니다.
            </div>
            <div className="receipt">
              <div className="r"><span className="k">전달 대상</span><span className="v">{cert.providerCompany || "직접 전달"}</span></div>
              <div className="r"><span className="k">본인확인</span><span className="v">{cert.identityVerified ? `완료${cert.method ? ` · ${cert.method}` : ""}` : "-"}</span></div>
              <div className="r"><span className="k">상태</span><span className="v">{cert.trustLevel}</span></div>
              <div className="r"><span className="k">확인된 이력</span><span className="v">{cert.summary?.confirmedAdoptionsOrDeals ?? 0}건</span></div>
              <div className="r"><span className="k">중대 위반(확정)</span><span className="v">{cert.summary?.seriousBreaches ?? 0}건</span></div>
              <div className="r"><span className="k">생성</span><span className="v mono">{fmtDateTime(cert.issuedAt || cert.submittedAt)}</span></div>
              <div className="r"><span className="k">유효</span><span className="v mono">{fmtDateTime(cert.expiresAt)}</span></div>
            </div>
            {cert.notice && <p className="hint">{cert.notice}</p>}
            <p className="hint">재배포·목적 외 이용을 금지합니다. 보관·열람은 합의된 목적·기간 내에서만 해 주세요.</p>
          </>
        )}
      </div>
      <StepFooter
        next={{
          label: err ? "처음으로" : "닫기",
          onClick: () => {
            if (typeof window !== "undefined") {
              if (window.opener) { window.close(); return; }
              if (window.history.length > 1) { router.back(); return; }
            }
            router.push("/");
          },
        }}
      />
    </div>
  );
}
