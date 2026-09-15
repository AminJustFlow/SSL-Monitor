import {describe,expect,it} from "vitest";
import {statusForCertificate} from "@/modules/certificates/certificate-evaluator";
import {certificateChangeType,compareCertificates} from "@/modules/certificates/certificate-comparison";
import {isTransient,tlsConnectionOptions} from "@/modules/certificates/certificate-checker";
import {isBlockedAddress} from "@/lib/security/network";
import {readFileSync} from "node:fs";

describe("independent edge and origin certificates",()=>{
  const edge={expiresAt:new Date("2026-09-11T00:04:32.000Z")};
  const origin={expiresAt:new Date("2026-08-06T10:06:56.000Z")};
  it("keeps a public-only check independent",()=>expect(compareCertificates(edge,false,undefined)).toMatchObject({edgeChecked:true,originChecked:false,originStatus:"NOT_CONFIGURED",earliestType:"PUBLIC"}));
  it("connects to an origin IP while retaining hostname SNI",()=>expect(tlsConnectionOptions({connectHost:"71.168.71.195",servername:"studleys.com",port:443})).toEqual({host:"71.168.71.195",port:443,servername:"studleys.com",rejectUnauthorized:false}));
  it("adds public and Cloudflare roots for Cloudflare origins",()=>{const options=tlsConnectionOptions({connectHost:"71.168.71.195",servername:"studleys.com",trustCloudflareOrigin:true});expect("ca" in options&&options.ca.length).toBeGreaterThan(100)});
  it("detects different expirations and selects the Studleys origin",()=>expect(compareCertificates(edge,true,origin)).toMatchObject({mismatch:true,earliestType:"ORIGIN",originStatus:"CHECKED"}));
  it("uses the exact UTC timestamps",()=>{expect(edge.expiresAt?.toISOString()).toBe("2026-09-11T00:04:32.000Z");expect(origin.expiresAt?.toISOString()).toBe("2026-08-06T10:06:56.000Z")});
  it("calculates full days with floor rounding",()=>{const result=statusForCertificate({certificatePresent:true,connected:true,authorized:true,hostnameMatches:true,validFrom:new Date("2026-05-08T10:06:57Z"),expiresAt:origin.expiresAt,now:new Date("2026-07-31T14:06:57Z")});expect(result.daysRemaining).toBe(5);expect(result.remainingMs).toBe(origin.expiresAt!.valueOf()-new Date("2026-07-31T14:06:57Z").valueOf())});
  it("makes an expired origin critical independently",()=>expect(statusForCertificate({certificatePresent:true,connected:true,authorized:true,hostnameMatches:true,validFrom:new Date("2026-01-01Z"),expiresAt:new Date("2026-07-01Z"),now:new Date("2026-07-31Z")}).status).toBe("EXPIRED"));
  it("distinguishes hostname and chain failures",()=>{const base={certificatePresent:true,connected:true,validFrom:new Date("2026-01-01Z"),expiresAt:new Date("2027-01-01Z"),now:new Date("2026-07-31Z")};expect(statusForCertificate({...base,authorized:true,hostnameMatches:false}).status).toBe("INVALID");expect(statusForCertificate({...base,authorized:false,hostnameMatches:true}).status).toBe("INVALID")});
  it("reports enabled but unchecked origins as unknown",()=>expect(compareCertificates(edge,true,undefined).originStatus).toBe("UNKNOWN"));
  it("blocks unsafe origin IPs",()=>{expect(isBlockedAddress("127.0.0.1")).toBe(true);expect(isBlockedAddress("169.254.169.254")).toBe(true);expect(isBlockedAddress("10.0.0.1")).toBe(true)});
  it("retries transient network errors but not blocked hosts",()=>{const base={success:false,certificatePresent:false,authorized:false,hostnameMatches:false,subjectAlternativeNames:[],connectHost:"example.com",sniHostname:"example.com",durationMs:1,status:"UNAVAILABLE" as const};expect(isTransient({...base,errorCode:"TIMEOUT"})).toBe(true);expect(isTransient({...base,errorCode:"BLOCKED_HOST"})).toBe(false)});
  it("distinguishes renewal from certificate replacement",()=>{expect(certificateChangeType({fingerprint:"old",expiresAt:new Date("2026-10-01")},{fingerprint:"new",expiresAt:new Date("2027-01-01")})).toBe("CERTIFICATE_RENEWED");expect(certificateChangeType({fingerprint:"old",expiresAt:new Date("2027-01-01")},{fingerprint:"new",expiresAt:new Date("2026-10-01")})).toBe("CERTIFICATE_CHANGED")});
  it("keeps existing website rows backward compatible",()=>{const migration=readFileSync("prisma/migrations/20260731000000_edge_origin_details/migration.sql","utf8");expect(migration).toContain('"originPort" INTEGER NOT NULL DEFAULT 443');expect(migration).toContain('"connectionType" "ConnectionType" NOT NULL DEFAULT \'UNKNOWN\'')});
});
