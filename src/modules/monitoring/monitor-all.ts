import pLimit from "p-limit";
import { db } from "@/lib/database";
import { config } from "@/lib/config";
import { log } from "@/lib/logging";
import { monitorWebsite } from "./monitor-website";

export async function monitorAll(triggerType:"SCHEDULED"|"MANUAL"="SCHEDULED") {
  const lock=await db.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_lock(741852963) AS locked`;
  if(!lock[0]?.locked){log("warn","monitor_run_skipped",{reason:"overlap"});return null;}
  const run=await db.monitoringRun.create({data:{triggerType}}); log("info","monitor_run_started",{runId:run.id});
  try {
    const websites=await db.website.findMany({where:{enabled:true}}); const limit=pLimit(config().MONITOR_CONCURRENCY);
    const results=await Promise.all(websites.map(w=>limit(async()=>{try{return await monitorWebsite(w);}catch(error){log("error","website_check_exception",{websiteId:w.id,error:error instanceof Error?error.message:"Unknown"});return{successful:0,failed:1,alertsSent:0,status:"UNAVAILABLE" as const};}})));
    const totals=results.reduce((a,r)=>({successful:a.successful+r.successful,failed:a.failed+r.failed,alertsSent:a.alertsSent+r.alertsSent}),{successful:0,failed:0,alertsSent:0});
    const status=totals.failed ? (totals.successful ? "PARTIAL":"FAILED"):"COMPLETED";
    await db.monitoringRun.update({where:{id:run.id},data:{completedAt:new Date(),status,websitesProcessed:websites.length,checksSuccessful:totals.successful,checksFailed:totals.failed,alertsSent:totals.alertsSent}});
    log("info","monitor_run_completed",{runId:run.id,status,...totals}); return {runId:run.id,status,...totals};
  } catch(error) {
    await db.monitoringRun.update({where:{id:run.id},data:{completedAt:new Date(),status:"FAILED",errorMessage:error instanceof Error?error.message:"Job failed"}});
    throw error;
  } finally { await db.$executeRaw`SELECT pg_advisory_unlock(741852963)`; }
}
