import LabEsignFlow from "@/components/LabEsignFlow";
import payload from "@/lib/testForms/freepass-issue-payload.json";

export const metadata = { title: "전자계약 샘플 · 착한거래" };

/** 폰용 전자계약 UX 샘플 — /consent/sample */
export default function ConsentSamplePage() {
  return <LabEsignFlow payload={payload} />;
}
