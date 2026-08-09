import { notFound } from "next/navigation";
import LabEsignFlow from "@/components/LabEsignFlow";
import payload from "@/lib/testForms/freepass-issue-payload.json";

export const metadata = { title: "전자계약 렌더러 테스트 — 착한거래" };

/**
 * /labs/esign — 프리패스가 보내는 issue payload 를 그대로 렌더한다.
 * 운영 동선이 아니다. DEMO_MODE 에서만 열린다.
 */
export default function LabEsignPage() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") notFound();
  return <LabEsignFlow payload={payload} />;
}
