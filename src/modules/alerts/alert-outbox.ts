import { db } from "@/lib/database";
import { log } from "@/lib/logging";
import { sendEmail } from "./email-sender";

const RETRY_DELAYS_MS=[5*60_000,30*60_000,2*60*60_000,6*60*60_000];
export const alertRetryDelayMs=(failedAttemptIndex:number)=>RETRY_DELAYS_MS[failedAttemptIndex];

export interface QueuedAlert {
  websiteId?:string;
  certificateCheckId?:string;
  alertType:string;
  threshold?:number;
  recipient:string;
  subject:string;
  text:string;
  html:string;
  dedupKey:string;
}

export async function queueAlert(input:QueuedAlert,deliverNow=true){
  let id:string;
  try{
    const alert=await db.alertEvent.create({data:{websiteId:input.websiteId,certificateCheckId:input.certificateCheckId,alertType:input.alertType,threshold:input.threshold,recipient:input.recipient,subject:input.subject,textBody:input.text,htmlBody:input.html,dedupKey:input.dedupKey,nextAttemptAt:new Date()}});
    id=alert.id;
  }catch(error){
    if((error as {code?:string}).code!=="P2002")throw error;
    const existing=await db.alertEvent.findUniqueOrThrow({where:{dedupKey:input.dedupKey},select:{id:true}});
    id=existing.id;
  }
  return deliverNow?deliverAlert(id):false;
}

export async function deliverAlert(id:string){
  const alert=await db.alertEvent.findUnique({where:{id}});
  if(!alert||alert.deliveryStatus!=="PENDING"||!alert.nextAttemptAt||alert.nextAttemptAt>new Date())return false;
  const now=new Date();
  const claim=await db.alertEvent.updateMany({where:{id,deliveryStatus:"PENDING",attemptCount:alert.attemptCount},data:{attemptCount:{increment:1},lastAttemptAt:now,nextAttemptAt:null}});
  if(!claim.count)return false;
  try{
    const info=await sendEmail(alert.recipient,alert.subject,alert.textBody,alert.htmlBody);
    await db.alertEvent.update({where:{id},data:{deliveryStatus:"SENT",sentAt:new Date(),providerMessageId:info.messageId,errorMessage:null}});
    return true;
  }catch(error){
    const message=error instanceof Error?error.message:"Delivery failed";
    const delay=alertRetryDelayMs(alert.attemptCount);
    await db.alertEvent.update({where:{id},data:{deliveryStatus:delay===undefined?"FAILED":"PENDING",nextAttemptAt:delay===undefined?null:new Date(Date.now()+delay),errorMessage:message}});
    log("error","alert_delivery_failed",{alertId:id,attempt:alert.attemptCount+1,terminal:delay===undefined,error:message});
    return false;
  }
}

export async function dispatchDueAlerts(limit=50){
  const alerts=await db.alertEvent.findMany({where:{deliveryStatus:"PENDING",nextAttemptAt:{lte:new Date()}},select:{id:true},orderBy:{nextAttemptAt:"asc"},take:limit});
  let sent=0;
  for(const alert of alerts)if(await deliverAlert(alert.id))sent++;
  return {processed:alerts.length,sent};
}
