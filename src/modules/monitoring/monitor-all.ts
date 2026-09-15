import { PrismaClient } from "@prisma/client";
import pLimit from "p-limit";
import { db } from "@/lib/database";
import { config } from "@/lib/config";
import { log } from "@/lib/logging";
import { monitorWebsite } from "./monitor-website";

function lockDatabase(){
  const raw=process.env.DATABASE_URL;
  if(!raw)throw new Error("DATABASE_URL is required");
  const url=new URL(raw);
  url.searchParams.set("connection_limit","1");
  return new PrismaClient({datasourceUrl:url.toString()});
}

export async function monitorAll(triggerType:"SCHEDULED"|"MANUAL"="SCHEDULED",schedule?:{scheduleDate:string;attempt:number}) {
  const lockDb=lockDatabase();
  let locked=false;
  try{
    const lock=await lockDb.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_lock(741852963) AS locked`;
    locked=Boolean(lock[0]?.locked);
    if(!locked){log("warn","monitor_run_skipped",{reason:"overlap"});return null;}
    let run;
    try{run=await db.monitoringRun.create({data:{triggerType,scheduleDate:schedule?.scheduleDate,attempt:schedule?.attempt??1}});}
    catch(error){if((error as {code?:string}).code==="P2002"){log("warn","monitor_run_skipped",{reason:"overlap"});return null;}throw error;}
    log("info","monitor_run_started",{runId:run.id,scheduleDate:schedule?.scheduleDate,attempt:schedule?.attempt});
    try{
      const websites=await db.website.findMany({where:{enabled:true}});
      const limit=pLimit(config().MONITOR_CONCURRENCY);
      const results=await Promise.all(websites.map(website=>limit(async()=>{try{return await monitorWebsite(website);}catch(error){log("error","website_check_exception",{websiteId:website.id,error:error instanceof Error?error.message:"Unknown"});return{successful:0,failed:1,alertsSent:0,status:"UNAVAILABLE" as const};}})));
      const totals=results.reduce((sum,result)=>({successful:sum.successful+result.successful,failed:sum.failed+result.failed,alertsSent:sum.alertsSent+result.alertsSent}),{successful:0,failed:0,alertsSent:0});
      const status=totals.failed?(totals.successful?"PARTIAL":"FAILED"):"COMPLETED";
      await db.monitoringRun.update({where:{id:run.id},data:{completedAt:new Date(),status,websitesProcessed:websites.length,checksSuccessful:totals.successful,checksFailed:totals.failed,alertsSent:totals.alertsSent}});
      log("info","monitor_run_completed",{runId:run.id,status,...totals});
      return {runId:run.id,status,...totals};
    }catch(error){
      await db.monitoringRun.update({where:{id:run.id},data:{completedAt:new Date(),status:"FAILED",errorMessage:error instanceof Error?error.message:"Job failed"}});
      throw error;
    }
  }finally{
    if(locked)try{await lockDb.$executeRaw`SELECT pg_advisory_unlock(741852963)`;}catch(error){log("error","monitor_lock_release_failed",{error:error instanceof Error?error.message:"Lock release failed"});}
    await lockDb.$disconnect();
  }
}
