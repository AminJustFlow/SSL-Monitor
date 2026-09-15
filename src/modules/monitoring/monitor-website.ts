import type { CheckStatus, CertificateCheck, Website } from "@prisma/client";
import { db } from "@/lib/database";
import { config } from "@/lib/config";
import { log } from "@/lib/logging";
import { queueAlert } from "@/modules/alerts/alert-outbox";
import { evaluateCertificateAlerts } from "@/modules/alerts/alert-evaluator";
import { renderAlert } from "@/modules/alerts/email-renderer";
import { checkCertificate } from "@/modules/certificates/certificate-checker";
import { certificateChangeType } from "@/modules/certificates/certificate-comparison";
import { checkHttp } from "@/modules/http-monitoring/http-checker";
import { localDateKey } from "@/modules/scheduling/daily-schedule";
import { combinedStatus } from "./status-calculator";

export async function monitorWebsite(website: Website) {
  const certStatuses:CheckStatus[]=[];
  let successful=0,failed=0,alertsSent=0;
  const proxied=website.connectionType==="CLOUDFLARE"||website.connectionType==="CDN"||website.usesCloudflare;
  const certificateResults:Partial<Record<"PUBLIC"|"ORIGIN",Awaited<ReturnType<typeof checkCertificate>>>>={};

  const runCert=async(type:"PUBLIC"|"ORIGIN",connectHost:string,servername:string,allowPrivate=false)=>{
    const previous=await db.certificateCheck.findFirst({where:{websiteId:website.id,checkType:type,certificatePresent:true,expiresAt:{not:null}},orderBy:{checkedAt:"desc"}});
    const port=type==="ORIGIN"?website.originPort:website.port;
    const result=await checkCertificate({connectHost,servername,port,timeoutMs:website.tlsTimeoutMs,allowPrivate,warningDays:type==="ORIGIN"?website.originWarningDays:website.edgeWarningDays,criticalDays:type==="ORIGIN"?website.originCriticalDays:website.edgeCriticalDays,trustCloudflareOrigin:type==="ORIGIN"&&website.connectionType==="CLOUDFLARE"});
    certificateResults[type]=result;
    if(result.success)successful++;else failed++;
    const saved=await db.certificateCheck.create({data:{websiteId:website.id,checkType:type,success:result.success,certificatePresent:result.certificatePresent,authorized:result.authorized,authorizationError:result.authorizationError,validFrom:result.validFrom,expiresAt:result.expiresAt,daysRemaining:result.daysRemaining,remainingMs:result.remainingMs===undefined?undefined:BigInt(result.remainingMs),issuer:result.issuer,subject:result.subject,subjectAlternativeNames:result.subjectAlternativeNames,fingerprint:result.fingerprint,serialNumber:result.serialNumber,protocol:result.protocol,cipher:result.cipher,connectHost:result.connectHost,connectPort:port,resolvedIp:result.resolvedIp,sniHostname:result.sniHostname,hostnameValid:result.hostnameMatches,chainValid:result.authorized,durationMs:result.durationMs,status:result.status,errorCode:result.errorCode,errorMessage:result.errorMessage}});

    const managedEdge=type==="PUBLIC"&&proxied&&website.checkOriginCertificate;
    const thresholds=managedEdge?[]:type==="PUBLIC"?[...new Set([...website.alertThresholds,website.edgeWarningDays,website.edgeCriticalDays])]:[...new Set([...website.alertThresholds,website.originWarningDays,website.originCriticalDays])];
    const candidates=evaluateCertificateAlerts({status:result.status,daysRemaining:result.daysRemaining,thresholds,fingerprint:result.fingerprint,previousStatus:previous?.status,reminderDate:localDateKey(new Date(),config().MONITORING_TIMEZONE)});
    for(const candidate of candidates)alertsSent+=await notify(website,saved,type,candidate.type,candidate.threshold,`${type}:${candidate.dedupScope}`);

    const eventType=!managedEdge?certificateChangeType(previous??undefined,result):undefined;
    if(eventType&&result.fingerprint){
      alertsSent+=await notify(website,saved,type,eventType,undefined,`${type}:${eventType}:${result.fingerprint}`);
    }

    if(!managedEdge||["EXPIRED","INVALID","UNAVAILABLE"].includes(result.status))certStatuses.push(result.status);
  };

  if(website.checkPublicCertificate)await runCert("PUBLIC",website.hostname,website.hostname);
  if(website.checkOriginCertificate&&website.originConnectHost&&website.originSniHostname)await runCert("ORIGIN",website.originConnectHost,website.originSniHostname,config().ALLOW_PRIVATE_ORIGIN_HOSTS);

  const edge=certificateResults.PUBLIC,origin=certificateResults.ORIGIN;
  if(edge?.expiresAt&&origin?.expiresAt&&edge.expiresAt.valueOf()!==origin.expiresAt.valueOf())log("info","certificate_expiration_mismatch",{websiteId:website.id,edgeExpiresAt:edge.expiresAt.toISOString(),originExpiresAt:origin.expiresAt.toISOString(),actionableCertificate:"ORIGIN"});

  let httpStatus:Awaited<ReturnType<typeof checkHttp>>["status"]|undefined;
  if(website.checkHttp){
    const result=await checkHttp(website.publicUrl,website.httpTimeoutMs);
    httpStatus=result.status;
    if(result.success)successful++;else failed++;
    await db.httpCheck.create({data:{websiteId:website.id,...result}});
  }
  const missingOrigin=proxied&&(!website.checkOriginCertificate||!website.originConnectHost||!website.originSniHostname);
  const calculated=combinedStatus(certStatuses,httpStatus);
  const status=missingOrigin&&(!httpStatus||httpStatus==="AVAILABLE")?"UNKNOWN":calculated;
  await db.website.update({where:{id:website.id},data:{lastCheckedAt:new Date(),lastStatus:status}});
  if(failed)log("warn","website_check_failed",{websiteId:website.id,status,failed});
  return {status,successful,failed,alertsSent};
}

async function notify(website:Website,check:CertificateCheck,type:"PUBLIC"|"ORIGIN",eventType:string,threshold:number|undefined,dedupScope:string){
  const label=type==="PUBLIC"?"Public / Edge":"Origin";
  const details=`${label} certificate for ${website.hostname}; status: ${check.status}; exact UTC expiration: ${check.expiresAt?.toISOString()??"unknown"}; ${check.daysRemaining??"unknown"} full days remain; ${check.authorizationError??check.errorMessage??""}`;
  const rendered=renderAlert(website,`${label} ${eventType}`,details);
  let sent=0;
  for(const recipient of website.alertRecipients){
    if(await queueAlert({websiteId:website.id,certificateCheckId:check.id,alertType:eventType,threshold,recipient,subject:rendered.subject,text:rendered.text,html:rendered.html,dedupKey:`${website.id}:${dedupScope}:${recipient}`}))sent++;
  }
  return sent;
}
