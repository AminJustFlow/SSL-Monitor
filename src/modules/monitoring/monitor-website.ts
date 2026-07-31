import type { CheckStatus, Website } from "@prisma/client";
import { db } from "@/lib/database";
import { checkCertificate } from "@/modules/certificates/certificate-checker";
import { checkHttp } from "@/modules/http-monitoring/http-checker";
import { combinedStatus } from "./status-calculator";
import { evaluateCertificateAlerts } from "@/modules/alerts/alert-evaluator";
import { renderAlert } from "@/modules/alerts/email-renderer";
import { sendEmail } from "@/modules/alerts/email-sender";
import { log } from "@/lib/logging";
import { config } from "@/lib/config";

export async function monitorWebsite(website: Website) {
  const priorStatus=website.lastStatus; const certStatuses: CheckStatus[]=[]; let successful=0, failed=0, alertsSent=0;
  const certificateResults: Partial<Record<"PUBLIC"|"ORIGIN", Awaited<ReturnType<typeof checkCertificate>>>>={};
  const savedCheckIds:Partial<Record<"PUBLIC"|"ORIGIN",string>>={};
  const runCert=async(type:"PUBLIC"|"ORIGIN",connectHost:string,servername:string,allowPrivate=false)=>{
    const port=type==="ORIGIN"?website.originPort:website.port;
    const result=await checkCertificate({connectHost,servername,port,timeoutMs:website.tlsTimeoutMs,allowPrivate,warningDays:type==="ORIGIN"?website.originWarningDays:website.edgeWarningDays,criticalDays:type==="ORIGIN"?website.originCriticalDays:website.edgeCriticalDays});
    certificateResults[type]=result;
    certStatuses.push(result.status); if(result.success) successful++; else failed++;
    const saved=await db.certificateCheck.create({data:{websiteId:website.id,checkType:type,success:result.success,certificatePresent:result.certificatePresent,authorized:result.authorized,authorizationError:result.authorizationError,validFrom:result.validFrom,expiresAt:result.expiresAt,daysRemaining:result.daysRemaining,remainingMs:result.remainingMs===undefined?undefined:BigInt(result.remainingMs),issuer:result.issuer,subject:result.subject,subjectAlternativeNames:result.subjectAlternativeNames,fingerprint:result.fingerprint,serialNumber:result.serialNumber,protocol:result.protocol,cipher:result.cipher,connectHost:result.connectHost,connectPort:port,resolvedIp:result.resolvedIp,sniHostname:result.sniHostname,hostnameValid:result.hostnameMatches,chainValid:result.authorized,durationMs:result.durationMs,status:result.status,errorCode:result.errorCode,errorMessage:result.errorMessage}});
    savedCheckIds[type]=saved.id;
    const thresholds=type==="PUBLIC"?[...new Set([...website.alertThresholds,website.edgeWarningDays,website.edgeCriticalDays])]:[...new Set([...website.alertThresholds,website.originWarningDays,website.originCriticalDays])];
    const candidates=evaluateCertificateAlerts({status:result.status,daysRemaining:result.daysRemaining,thresholds,fingerprint:result.fingerprint,previousStatus:priorStatus});
    for(const candidate of candidates) for(const recipient of website.alertRecipients) {
      const dedupKey=`${website.id}:${type}:${candidate.dedupScope}:${recipient}`;
      const label=type==="PUBLIC"?"Public / Edge":"Origin";
      const rendered=renderAlert(website,`${label} ${candidate.type}`,`${label} certificate for ${website.hostname}; status: ${result.status}; exact UTC expiration: ${result.expiresAt?.toISOString() ?? "unknown"}; ${result.daysRemaining ?? "unknown"} full days remain; ${result.authorizationError ?? result.errorMessage ?? ""}`);
      try {
        const alert=await db.alertEvent.create({data:{websiteId:website.id,certificateCheckId:saved.id,alertType:candidate.type,threshold:candidate.threshold,recipient,subject:rendered.subject,dedupKey}});
        try { const info=await sendEmail(recipient,rendered.subject,rendered.text,rendered.html); await db.alertEvent.update({where:{id:alert.id},data:{deliveryStatus:"SENT",sentAt:new Date(),providerMessageId:info.messageId}}); alertsSent++; }
        catch(error){ await db.alertEvent.update({where:{id:alert.id},data:{deliveryStatus:"FAILED",errorMessage:error instanceof Error?error.message:"Delivery failed"}}); }
      } catch(error) { if ((error as {code?:string}).code !== "P2002") throw error; }
    }
  };
  if(website.checkPublicCertificate) await runCert("PUBLIC",website.hostname,website.hostname);
  if(website.checkOriginCertificate && website.originConnectHost && website.originSniHostname) await runCert("ORIGIN",website.originConnectHost,website.originSniHostname,process.env.ALLOW_PRIVATE_ORIGIN_HOSTS==="true");
  const edge=certificateResults.PUBLIC,origin=certificateResults.ORIGIN;
  if(edge?.expiresAt&&origin?.expiresAt&&edge.expiresAt.valueOf()!==origin.expiresAt.valueOf()){
    log("warn","certificate_expiration_mismatch",{websiteId:website.id,edgeExpiresAt:edge.expiresAt.toISOString(),originExpiresAt:origin.expiresAt.toISOString(),earliest:origin.expiresAt<edge.expiresAt?"ORIGIN":"PUBLIC"});
    const earliest=origin.expiresAt<edge.expiresAt?"ORIGIN":"PUBLIC";
    const timezone=config().MONITORING_TIMEZONE;
    const local=(date:Date)=>new Intl.DateTimeFormat("en-US",{timeZone:timezone,dateStyle:"long",timeStyle:"long"}).format(date);
    for(const recipient of website.alertRecipients){
      const dedupKey=`${website.id}:EXPIRATION_MISMATCH:${edge.fingerprint??edge.expiresAt.toISOString()}:${origin.fingerprint??origin.expiresAt.toISOString()}:${recipient}`;
      const details=`Certificate expiration mismatch detected for ${website.hostname}. Public / Edge certificate: ${local(edge.expiresAt)} (${edge.expiresAt.toISOString()}). Origin certificate: ${local(origin.expiresAt)} (${origin.expiresAt.toISOString()}). The ${earliest==="ORIGIN"?"origin":"public / edge"} certificate expires first and requires attention.`;
      const rendered=renderAlert(website,"Certificate expiration mismatch",details);
      try{const alert=await db.alertEvent.create({data:{websiteId:website.id,certificateCheckId:savedCheckIds[earliest],alertType:"EXPIRATION_MISMATCH",recipient,subject:rendered.subject,dedupKey}});try{const info=await sendEmail(recipient,rendered.subject,rendered.text,rendered.html);await db.alertEvent.update({where:{id:alert.id},data:{deliveryStatus:"SENT",sentAt:new Date(),providerMessageId:info.messageId}});alertsSent++;}catch(error){await db.alertEvent.update({where:{id:alert.id},data:{deliveryStatus:"FAILED",errorMessage:error instanceof Error?error.message:"Delivery failed"}});}}catch(error){if((error as {code?:string}).code!=="P2002")throw error;}
    }
  }
  let httpStatus: Awaited<ReturnType<typeof checkHttp>>["status"]|undefined;
  if(website.checkHttp){const result=await checkHttp(website.publicUrl,website.httpTimeoutMs);httpStatus=result.status;if(result.success) successful++; else failed++;await db.httpCheck.create({data:{websiteId:website.id,...result}});}
  const status=combinedStatus(certStatuses,httpStatus);
  await db.website.update({where:{id:website.id},data:{lastCheckedAt:new Date(),lastStatus:status}});
  if(failed) log("warn","website_check_failed",{websiteId:website.id,status,failed});
  return {status,successful,failed,alertsSent};
}
