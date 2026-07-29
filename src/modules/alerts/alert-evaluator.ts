import type { CertificateStatus } from "@/modules/certificates/certificate-types";
export interface AlertCandidate { type: string; threshold?: number; dedupScope: string; }
export function evaluateCertificateAlerts(input: { status: CertificateStatus; daysRemaining?: number; thresholds: number[]; fingerprint?: string; previousStatus?: CertificateStatus }): AlertCandidate[] {
  const scope = input.fingerprint ?? "no-certificate";
  const alerts: AlertCandidate[] = [];
  if (input.daysRemaining !== undefined) {
    const crossed = [...input.thresholds].sort((a,b)=>a-b).find(t => input.daysRemaining! <= t && input.daysRemaining! >= 0);
    if (crossed !== undefined) alerts.push({ type: "EXPIRY_THRESHOLD", threshold: crossed, dedupScope: `${scope}:threshold:${crossed}` });
  }
  if (input.status === "EXPIRED") alerts.push({ type: "EXPIRED", threshold: 0, dedupScope: `${scope}:expired` });
  if (["INVALID","UNAVAILABLE"].includes(input.status)) alerts.push({ type: input.status, dedupScope: `${scope}:${input.status}` });
  if (input.previousStatus && ["EXPIRED","INVALID","UNAVAILABLE"].includes(input.previousStatus) && ["HEALTHY","WARNING","URGENT","CRITICAL"].includes(input.status)) alerts.push({ type: "RECOVERY", dedupScope: `${scope}:recovery` });
  return alerts;
}
