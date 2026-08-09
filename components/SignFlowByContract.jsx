"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LabEsignFlow from "@/components/LabEsignFlow";

/**
 * 계약 하나를 손님 화면으로 그린다. 라우트가 `contractId` 만 넘겨준다.
 *
 * 두 경로가 이 컴포넌트를 함께 쓴다 —
 *   `/{계약ID}`        지금 손님에게 나가는 짧은 링크
 *   `/sign?c={계약ID}` 이미 나간 링크(하위호환). 깨지 않는다.
 *
 * 화면 자체는 `LabEsignFlow` 다. 다른 것은 «어디에 쓰느냐»뿐이라 `api` 로 주입한다.
 */
function useContractApi(contractId, tokenRef) {
  const post = useCallback(async (body) => {
    const r = await fetch(`/api/v1/contract/${encodeURIComponent(contractId)}/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, identityToken: tokenRef.current || "" }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "처리 실패");
    return j;
  }, [contractId, tokenRef]);

  return useMemo(() => ({
    /** 촬영·서명본 전송. key 에 따라 서버 action 이 갈린다. */
    async send(key, dataUrl) {
      if (key === "idcard") await post({ action: "identity", idImage: dataUrl });
      else if (key === "selfie") await post({ action: "identity", faceImage: dataUrl });
      else if (key === "signature") await post({ action: "sign", signature: dataUrl });
      else await post({ action: "document", key, dataUrl });

      // 서버는 파일 메타를 돌려주지 않는다(손님 화면에 경로·해시를 보일 이유가 없다).
      const bytes = Math.max(0, Math.round((String(dataUrl).length * 3) / 4) - 2);
      const m = String(dataUrl).match(/^data:([^;]+);/);
      return { key, version: 1, storagePath: "", contentType: m ? m[1] : "", bytes, sha256: "", receivedAt: Date.now() };
    },

    /** 섹션 확인 시각을 그때그때 남긴다. 실패해도 화면은 막지 않는다. */
    onConsent(key) {
      post({ action: "consent", key }).catch(() => { /* 진행 우선 */ });
    },

    /** 개인정보 동의 응답 — 「동의함/동의하지 않음」과 시각. */
    onAck(key, agreed) {
      post({ action: "ack", key, agreed }).catch(() => { /* 진행 우선 */ });
    },

    /**
     * 서명 직전에 손님이 채운 값을 서버에 올린다.
     * 서명이 봉인 시점이라, 그때 서버에 값이 없으면 계약서가 빈 칸으로 굳는다.
     */
    async beforeSign(state) {
      if (state?.inputs && Object.keys(state.inputs).length) {
        await post({ action: "input", values: state.inputs });
      }
    },

    /** 서명은 send('signature') 에서 완료된다. 봉인 결과만 받아 온다. */
    async submit() {
      const r = await fetch(`/api/v1/contract/${encodeURIComponent(contractId)}`, { cache: "no-store" }).catch(() => null);
      const j = r && r.ok ? await r.json().catch(() => null) : null;
      return {
        contractId,
        sealHash: j?.sealHash || "",
        store: "firestore",
        path: `contracts/${contractId}`,
        certificate: { verifyNo: j?.verifyNo || "" },
        counts: {},
      };
    },
  }), [post, contractId]);
}

export default function SignFlowByContract({ contractId }) {
  const [view, setView] = useState(null);
  const [err, setErr] = useState("");
  const [blocked, setBlocked] = useState("");
  const tokenRef = useRef("");

  const api = useContractApi(contractId, tokenRef);

  // AuthFlow 가 sessionStorage 에 넣어둔 본인확인 토큰을 집어 온다.
  useEffect(() => {
    const t = setInterval(() => {
      try {
        const v = sessionStorage.getItem("rs_idv_token");
        if (v) tokenRef.current = v;
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!contractId) { setErr("계약 링크가 올바르지 않습니다."); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/v1/contract/${encodeURIComponent(contractId)}/guest`);
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !j.ok) { setErr(j.error || "계약을 불러오지 못했습니다."); return; }
        if (j.blocked) setBlocked(j.reason || "blocked");
        setView(j.view);
      } catch {
        if (!cancelled) setErr("계약을 불러오지 못했습니다.");
      }
    })();
    return () => { cancelled = true; };
  }, [contractId]);

  if (err) {
    return <div className="app"><div className="c-body"><div className="auth-err">{err}</div></div></div>;
  }
  if (blocked) {
    return (
      <div className="app">
        <div className="c-body">
          <div className="done">
            <div className="big">{blocked === "signed" ? "✓" : "!"}</div>
            <h2>{blocked === "signed" ? "이미 서명이 완료된 계약입니다" : "계약 링크가 만료되었습니다"}</h2>
            <p>서명 화면을 다시 열 수 없습니다. 문의는 계약 담당자에게 해 주세요.</p>
          </div>
        </div>
      </div>
    );
  }
  if (!view) {
    return <div className="app"><div className="c-body"><div className="skel" /><div className="skel" /></div></div>;
  }

  return <LabEsignFlow payload={view} api={api} />;
}
