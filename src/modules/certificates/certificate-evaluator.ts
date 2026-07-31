import type { CertificateStatus } from "./certificate-types";

export function statusForCertificate(input: {
  certificatePresent: boolean; connected: boolean; authorized: boolean; hostnameMatches: boolean;
  validFrom?: Date; expiresAt?: Date; now?: Date; warningDays?: number; criticalDays?: number;
}): { status: CertificateStatus; daysRemaining?: number; remainingMs?: number } {
  const now = input.now ?? new Date();
  if (!input.connected) return { status: "UNAVAILABLE" };
  if (!input.certificatePresent) return { status: "INVALID" };
  if (!input.validFrom || !input.expiresAt || Number.isNaN(input.validFrom.valueOf()) || Number.isNaN(input.expiresAt.valueOf())) return { status: "INVALID" };
  const remainingMs = input.expiresAt.valueOf() - now.valueOf();
  const daysRemaining = Math.floor(remainingMs / 86_400_000);
  if (input.validFrom > now || !input.hostnameMatches || !input.authorized) return { status: "INVALID", daysRemaining, remainingMs };
  if (remainingMs < 0) return { status: "EXPIRED", daysRemaining, remainingMs };
  if (daysRemaining <= (input.criticalDays??7)) return { status: "CRITICAL", daysRemaining, remainingMs };
  if (daysRemaining <= (input.warningDays??30)) return { status: "WARNING", daysRemaining, remainingMs };
  return { status: "HEALTHY", daysRemaining, remainingMs };
}
