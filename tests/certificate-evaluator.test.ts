import {describe,expect,it} from "vitest";
import {statusForCertificate} from "@/modules/certificates/certificate-evaluator";
const now=new Date("2026-01-01T00:00:00Z");const date=(days:number)=>new Date(now.valueOf()+days*86400000);const base={certificatePresent:true,connected:true,authorized:true,hostnameMatches:true,validFrom:date(-30),now};
describe("certificate evaluation",()=>{
  for(const [days,status] of [[90,"HEALTHY"],[30,"WARNING"],[14,"WARNING"],[7,"CRITICAL"],[3,"CRITICAL"],[1,"CRITICAL"],[-1,"EXPIRED"]] as const)it(`${days} days is ${status}`,()=>expect(statusForCertificate({...base,expiresAt:date(days)}).status).toBe(status));
  it("not yet valid",()=>expect(statusForCertificate({...base,validFrom:date(1),expiresAt:date(10)}).status).toBe("INVALID"));
  it("hostname mismatch",()=>expect(statusForCertificate({...base,hostnameMatches:false,expiresAt:date(90)}).status).toBe("INVALID"));
  it("self-signed/untrusted",()=>expect(statusForCertificate({...base,authorized:false,expiresAt:date(90)}).status).toBe("INVALID"));
  it("missing",()=>expect(statusForCertificate({...base,certificatePresent:false,expiresAt:date(90)}).status).toBe("INVALID"));
  it("timeout",()=>expect(statusForCertificate({...base,connected:false,expiresAt:date(90)}).status).toBe("UNAVAILABLE"));
  it("honors separate configured thresholds",()=>expect(statusForCertificate({...base,expiresAt:date(12),warningDays:20,criticalDays:5}).status).toBe("WARNING"));
});
