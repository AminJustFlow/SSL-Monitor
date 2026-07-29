export type CertificateStatus = "HEALTHY" | "WARNING" | "URGENT" | "CRITICAL" | "EXPIRED" | "INVALID" | "UNAVAILABLE" | "UNKNOWN";
export interface CertificateResult {
  success: boolean; certificatePresent: boolean; authorized: boolean; authorizationError?: string;
  hostnameMatches: boolean; validFrom?: Date; expiresAt?: Date; daysRemaining?: number;
  issuer?: Record<string, string>; subject?: Record<string, string>; subjectAlternativeNames: string[];
  fingerprint?: string; serialNumber?: string; protocol?: string; cipher?: string;
  connectHost: string; sniHostname: string; durationMs: number; status: CertificateStatus;
  errorCode?: string; errorMessage?: string;
}
