import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { config } from "@/lib/config";
import { isDailyScheduleDue } from "@/modules/scheduling/daily-schedule";

export const dynamic="force-dynamic";

export async function GET(){
  const now=new Date();
  let database="ok";
  try{await db.$queryRaw`SELECT 1`;}catch{database="unavailable";}
  if(database!=="ok")return NextResponse.json({status:"degraded",database,timestamp:now.toISOString()},{status:503});
  try{
    const [scheduler,latestScheduled,lastCompleted,pendingAlerts,failedAlerts]=await Promise.all([
      db.schedulerState.findUnique({where:{id:"singleton"}}),
      db.monitoringRun.findFirst({where:{triggerType:"SCHEDULED"},orderBy:{startedAt:"desc"}}),
      db.monitoringRun.findFirst({where:{triggerType:"SCHEDULED",status:"COMPLETED"},orderBy:{completedAt:"desc"}}),
      db.alertEvent.count({where:{deliveryStatus:"PENDING"}}),
      db.alertEvent.count({where:{deliveryStatus:"FAILED"}})
    ]);
    const cfg=config();
    const schedulerFresh=!cfg.DAILY_MONITORING_ENABLED||Boolean(scheduler&&now.valueOf()-scheduler.heartbeatAt.valueOf()<=cfg.SCHEDULER_STALE_MINUTES*60_000);
    const firstRunNotDue=!lastCompleted&&!isDailyScheduleDue(now,cfg.MONITORING_TIMEZONE,cfg.DAILY_MONITORING_TIME);
    const dailyRunFresh=!cfg.DAILY_MONITORING_ENABLED||firstRunNotDue||Boolean(lastCompleted?.completedAt&&now.valueOf()-lastCompleted.completedAt.valueOf()<=cfg.MONITORING_STALE_HOURS*60*60_000);
    const healthy=schedulerFresh&&dailyRunFresh;
    return NextResponse.json({status:healthy?"ok":"degraded",database,timestamp:now.toISOString(),version:process.env.npm_package_version??"1.0.0",dailyMonitoringEnabled:cfg.DAILY_MONITORING_ENABLED,schedulerHeartbeat:scheduler?.heartbeatAt??null,schedulerFresh,lastSchedulerError:scheduler?.lastError??null,latestScheduledRun:latestScheduled?{status:latestScheduled.status,startedAt:latestScheduled.startedAt,completedAt:latestScheduled.completedAt,scheduleDate:latestScheduled.scheduleDate,attempt:latestScheduled.attempt}:null,lastSuccessfulScheduledRun:lastCompleted?.completedAt??null,dailyRunFresh,pendingAlerts,failedAlerts},{status:healthy?200:503});
  }catch{
    return NextResponse.json({status:"degraded",database,timestamp:now.toISOString(),error:"Monitoring state unavailable; verify database migrations"},{status:503});
  }
}
