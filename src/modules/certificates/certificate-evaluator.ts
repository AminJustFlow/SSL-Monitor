import type { CertificateStatus } from "./certificate-types";

export function statusForCertificate(input: {
  certificatePresent: boolean; connected: boolean; authorized: boolean; hostnameMatches: boolean;
  validFrom?: Date; expiresAt?: Date; now?: Date;
}): { status: CertificateStatus; daysRemaining?: number } {
  const now = input.now ?? new Date();
  if (!input.connected) return { status: "UNAVAILABLE" };
  if (!input.certificatePresent) return { status: "INVALID" };
  if (!input.validFrom || !input.expiresAt || Number.isNaN(input.validFrom.valueOf()) || Number.isNaN(input.expiresAt.valueOf())) return { status: "INVALID" };
  const daysRemaining = Math.ceil((input.expiresAt.valueOf() - now.valueOf()) / 86_400_000);
  if (input.validFrom > now || !input.hostnameMatches || !input.authorized) return { status: "INVALID", daysRemaining };
  if (daysRemaining < 0) return { status: "EXPIRED", daysRemaining };
  if (daysRemaining <= 3) return { status: "CRITICAL", daysRemaining };
  if (daysRemaining <= 14) return { status: "URGENT", daysRemaining };
  if (daysRemaining <= 30) return { status: "WARNING", daysRemaining };
  return { status: "HEALTHY", daysRemaining };
}
