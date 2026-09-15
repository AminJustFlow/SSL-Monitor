import { db } from "@/lib/database";
import { config } from "@/lib/config";
import { log } from "@/lib/logging";
import { dispatchDueAlerts, queueAlert } from "@/modules/alerts/alert-outbox";
import { renderSystemAlert } from "@/modules/alerts/email-renderer";
import { monitorAll } from "@/modules/monitoring/monitor-all";
import { decideDailyRun, isDailyScheduleDue, localDateKey } from "./daily-schedule";

const RUN_STALE_MS=60*60_000;

export async function schedulerTick(now=new Date()){
  const cfg=config();
  await heartbeat(now);
  await dispatchDueAlerts();
  if(!cfg.DAILY_MONITORING_ENABLED)return {status:"DISABLED" as const};
  const scheduleDate=localDateKey(now,cfg.MONITORING_TIMEZONE);
  if(!isDailyScheduleDue(now,cfg.MONITORING_TIMEZONE,cfg.DAILY_MONITORING_TIME))return {status:"WAITING" as const,scheduleDate};

  const globalRunning=await db.monitoringRun.findFirst({where:{status:"RUNNING"},orderBy:{startedAt:"desc"}});
  if(globalRunning){
    if(now.valueOf()-globalRunning.startedAt.valueOf()<RUN_STALE_MS)return {status:"RUNNING" as const,scheduleDate};
    await db.monitoringRun.update({where:{id:globalRunning.id},data:{status:"FAILED",completedAt:now,errorMessage:"Monitoring run heartbeat timed out"}});
  }

  const runs=await db.monitoringRun.findMany({where:{triggerType:"SCHEDULED",scheduleDate},orderBy:[{attempt:"desc"},{startedAt:"desc"}]});
  const decision=decideDailyRun(runs,now);
  if(decision.status==="COMPLETED"){
    await db.schedulerState.update({where:{id:"singleton"},data:{lastScheduledDate:scheduleDate,lastError:null}});
    return {status:"COMPLETED" as const,scheduleDate};
  }

  const last=runs[0];
  if(decision.status==="EXHAUSTED"){
    await notifyRunFailure(scheduleDate,last?.errorMessage??"Daily monitoring remained partial or failed after three attempts");
    return {status:"EXHAUSTED" as const,scheduleDate};
  }
  if(decision.status==="RETRY_WAIT")return {status:"RETRY_WAIT" as const,scheduleDate};

  const attempt=decision.attempt;
  const heartbeatTimer=setInterval(()=>{heartbeat(new Date()).catch(error=>log("error","scheduler_heartbeat_failed",{error:error instanceof Error?error.message:"Heartbeat failed"}));},60_000);
  let result:Awaited<ReturnType<typeof monitorAll>>;
  try{result=await monitorAll("SCHEDULED",{scheduleDate,attempt});}
  finally{clearInterval(heartbeatTimer);}
  if(!result)return {status:"OVERLAP" as const,scheduleDate};
  if(result.status==="COMPLETED")await db.schedulerState.update({where:{id:"singleton"},data:{lastScheduledDate:scheduleDate,lastError:null}});
  else if(attempt>=3)await notifyRunFailure(scheduleDate,`Daily monitoring ended ${result.status.toLowerCase()} after three attempts (${result.failed} failed checks).`);
  return {status:result.status,scheduleDate,attempt};
}

async function heartbeat(now:Date,lastError?:string){
  await db.schedulerState.upsert({where:{id:"singleton"},create:{id:"singleton",heartbeatAt:now,lastError},update:{heartbeatAt:now,...(lastError===undefined?{}:{lastError})}});
}

async function notifyRunFailure(scheduleDate:string,details:string){
  await heartbeat(new Date(),details);
  const recipients=config().DEFAULT_ALERT_RECIPIENTS.split(",").map(x=>x.trim()).filter(Boolean);
  const rendered=renderSystemAlert("Daily monitoring failed",`${details} Scheduled date: ${scheduleDate}.`);
  for(const recipient of recipients)await queueAlert({alertType:"DAILY_RUN_FAILED",recipient,subject:rendered.subject,text:rendered.text,html:rendered.html,dedupKey:`system:daily-run-failed:${scheduleDate}:${recipient}`});
  log("error","daily_monitoring_exhausted",{scheduleDate,details,recipientCount:recipients.length});
}

export async function runScheduler(){
  const poll=config().SCHEDULER_POLL_MS;
  let stopping=false;
  const stop=()=>{stopping=true;};
  process.once("SIGTERM",stop);
  process.once("SIGINT",stop);
  log("info","scheduler_started",{pollMs:poll,time:config().DAILY_MONITORING_TIME,timeZone:config().MONITORING_TIMEZONE});
  while(!stopping){
    const started=Date.now();
    try{await schedulerTick();}
    catch(error){const message=error instanceof Error?error.message:"Scheduler tick failed";log("error","scheduler_tick_failed",{error:message});try{await heartbeat(new Date(),message);}catch{} }
    const wait=Math.max(1_000,poll-(Date.now()-started));
    if(!stopping)await new Promise(resolve=>setTimeout(resolve,wait));
  }
  await db.$disconnect();
}
