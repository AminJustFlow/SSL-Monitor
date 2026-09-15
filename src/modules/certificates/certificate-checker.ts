import tls, { type PeerCertificate } from "node:tls";
import { assertPublicHost } from "@/lib/security/network";
import { statusForCertificate } from "./certificate-evaluator";
import type { CertificateResult } from "./certificate-types";
import { CLOUDFLARE_ORIGIN_CA_ROOTS } from "./cloudflare-roots";

export function tlsConnectionOptions(opts:{connectHost:string;servername:string;port?:number;trustCloudflareOrigin?:boolean}){
  const base={host:opts.connectHost,port:opts.port??443,servername:opts.servername,rejectUnauthorized:false as const};
  return opts.trustCloudflareOrigin?{...base,ca:[...tls.rootCertificates,...CLOUDFLARE_ORIGIN_CA_ROOTS]}:base;
}

export async function checkCertificate(opts: { connectHost: string; servername: string; port?: number; timeoutMs?: number; allowPrivate?: boolean; warningDays?:number; criticalDays?:number; trustCloudflareOrigin?:boolean; attempts?:number }): Promise<CertificateResult> {
  const attempts=opts.attempts??3;
  let result=await checkCertificateOnce(opts);
  for(let attempt=1;attempt<attempts&&isTransient(result);attempt++){
    await new Promise(resolve=>setTimeout(resolve,attempt===1?1_000:5_000));
    result=await checkCertificateOnce(opts);
  }
  return result;
}

export function isTransient(result:CertificateResult){
  return result.status==="UNAVAILABLE"&&result.errorCode!=="BLOCKED_HOST";
}

async function checkCertificateOnce(opts: { connectHost: string; servername: string; port?: number; timeoutMs?: number; allowPrivate?: boolean; warningDays?:number; criticalDays?:number; trustCloudflareOrigin?:boolean }): Promise<CertificateResult> {
  const started = Date.now(); const port = opts.port ?? 443;
  const base = { connectHost: opts.connectHost, sniHostname: opts.servername, subjectAlternativeNames: [] as string[] };
  try {
    await assertPublicHost(opts.connectHost, opts.allowPrivate);
    return await new Promise(resolve => {
      let settled = false;
      const finish = (result: CertificateResult, socket?: tls.TLSSocket) => { if (settled) return; settled = true; socket?.destroy(); resolve(result); };
      const socket = tls.connect(tlsConnectionOptions({...opts,port}), () => {
        const cert = socket.getPeerCertificate(true) as PeerCertificate;
        const present = Boolean(cert?.raw);
        const validFrom = cert?.valid_from ? new Date(cert.valid_from) : undefined;
        const expiresAt = cert?.valid_to ? new Date(cert.valid_to) : undefined;
        const identityError = present ? tls.checkServerIdentity(opts.servername, cert) : new Error("Missing certificate");
        const evaluated = statusForCertificate({ certificatePresent: present, connected: true, authorized: socket.authorized, hostnameMatches: !identityError, validFrom, expiresAt, warningDays:opts.warningDays, criticalDays:opts.criticalDays });
        finish({
          ...base, success: evaluated.status !== "UNAVAILABLE", certificatePresent: present, authorized: socket.authorized,
          authorizationError: [socket.authorizationError, identityError?.message].filter(Boolean).join("; ") || undefined,
          hostnameMatches: !identityError, validFrom, expiresAt, daysRemaining: evaluated.daysRemaining, remainingMs: evaluated.remainingMs,
          issuer: cert?.issuer as Record<string,string>, subject: cert?.subject as Record<string,string>,
          subjectAlternativeNames: cert?.subjectaltname?.split(",").map(x => x.trim()) ?? [],
          fingerprint: cert?.fingerprint256 || cert?.fingerprint, serialNumber: cert?.serialNumber,
          protocol: socket.getProtocol() ?? undefined, cipher: socket.getCipher()?.name, resolvedIp: socket.remoteAddress,
          durationMs: Date.now() - started, status: evaluated.status
        }, socket);
      });
      socket.setTimeout(opts.timeoutMs ?? 10000, () => finish({ ...base, success: false, certificatePresent: false, authorized: false, hostnameMatches: false, durationMs: Date.now()-started, status: "UNAVAILABLE", errorCode: "TIMEOUT", errorMessage: "TLS connection timed out" }, socket));
      socket.once("error", err => finish({ ...base, success: false, certificatePresent: false, authorized: false, hostnameMatches: false, durationMs: Date.now()-started, status: "UNAVAILABLE", errorCode: (err as NodeJS.ErrnoException).code, errorMessage: err.message }, socket));
    });
  } catch (error) {
    const message=error instanceof Error ? error.message : "Connection rejected";
    const blocked=message.startsWith("Blocked host")||message.includes("blocked address");
    return { ...base, success: false, certificatePresent: false, authorized: false, hostnameMatches: false, durationMs: Date.now()-started, status: "UNAVAILABLE", errorCode: blocked?"BLOCKED_HOST":"DNS_ERROR", errorMessage: message };
  }
}
