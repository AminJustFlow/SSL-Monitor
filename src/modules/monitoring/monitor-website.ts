import type { CheckStatus, Website } from "@prisma/client";
import { db } from "@/lib/database";
import { checkCertificate } from "@/modules/certificates/certificate-checker";
import { checkHttp } from "@/modules/http-monitoring/http-checker";
import { combinedStatus } from "./status-calculator";
import { evaluateCertificateAlerts } from "@/modules/alerts/alert-evaluator";
import { renderAlert } from "@/modules/alerts/email-renderer";
import { sendEmail } from "@/modules/alerts/email-sender";
import { log } from "@/lib/logging";

export async function monitorWebsite(website: Website) {
  const priorStatus=website.lastStatus; const certStatuses: CheckStatus[]=[]; let successful=0, failed=0, alertsSent=0;
  const runCert=async(type:"PUBLIC"|"ORIGIN",connectHost:string,servername:string,allowPrivate=false)=>{
    const result=await checkCertificate({connectHost,servername,port:website.port,timeoutMs:website.tlsTimeoutMs,allowPrivate});
    certStatuses.push(result.status); if(result.success) successful++; else failed++;
    const saved=await db.certificateCheck.create({data:{websiteId:website.id,checkType:type,success:result.success,certificatePresent:result.certificatePresent,authorized:result.authorized,authorizationError:result.authorizationError,validFrom:result.validFrom,expiresAt:result.expiresAt,daysRemaining:result.daysRemaining,issuer:result.issuer,subject:result.subject,subjectAlternativeNames:result.subjectAlternativeNames,fingerprint:result.fingerprint,serialNumber:result.serialNumber,protocol:result.protocol,cipher:result.cipher,connectHost:result.connectHost,sniHostname:result.sniHostname,durationMs:result.durationMs,status:result.status,errorCode:result.errorCode,errorMessage:result.errorMessage}});
    const candidates=evaluateCertificateAlerts({status:result.status,daysRemaining:result.daysRemaining,thresholds:website.alertThresholds,fingerprint:result.fingerprint,previousStatus:priorStatus});
    for(const candidate of candidates) for(const recipient of website.alertRecipients) {
      const dedupKey=`${website.id}:${type}:${candidate.dedupScope}:${recipient}`;
      const rendered=renderAlert(website,candidate.type,`${type} certificate status: ${result.status}; expires: ${result.expiresAt?.toISOString() ?? "unknown"}; days remaining: ${result.daysRemaining ?? "unknown"}; ${result.authorizationError ?? result.errorMessage ?? ""}`);
      try {
        const alert=await db.alertEvent.create({data:{websiteId:website.id,certificateCheckId:saved.id,alertType:candidate.type,threshold:candidate.threshold,recipient,subject:rendered.subject,dedupKey}});
        try { const info=await sendEmail(recipient,rendered.subject,rendered.text,rendered.html); await db.alertEvent.update({where:{id:alert.id},data:{deliveryStatus:"SENT",sentAt:new Date(),providerMessageId:info.messageId}}); alertsSent++; }
        catch(error){ await db.alertEvent.update({where:{id:alert.id},data:{deliveryStatus:"FAILED",errorMessage:error instanceof Error?error.message:"Delivery failed"}}); }
      } catch(error) { if ((error as {code?:string}).code !== "P2002") throw error; }
    }
  };
  if(website.checkPublicCertificate) await runCert("PUBLIC",website.hostname,website.hostname);
  if(website.checkOriginCertificate && website.originConnectHost && website.originSniHostname) await runCert("ORIGIN",website.originConnectHost,website.originSniHostname,process.env.ALLOW_PRIVATE_ORIGIN_HOSTS==="true");
  let httpStatus: Awaited<ReturnType<typeof checkHttp>>["status"]|undefined;
  if(website.checkHttp){const result=await checkHttp(website.publicUrl,website.httpTimeoutMs);httpStatus=result.status;if(result.success) successful++; else failed++;await db.httpCheck.create({data:{websiteId:website.id,...result}});}
  const status=combinedStatus(certStatuses,httpStatus);
  await db.website.update({where:{id:website.id},data:{lastCheckedAt:new Date(),lastStatus:status}});
  if(failed) log("warn","website_check_failed",{websiteId:website.id,status,failed});
  return {status,successful,failed,alertsSent};
}
