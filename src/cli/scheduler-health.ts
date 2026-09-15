import { db } from "@/lib/database";
import { config } from "@/lib/config";

async function main(){
  const state=await db.schedulerState.findUnique({where:{id:"singleton"}});
  const staleMs=config().SCHEDULER_STALE_MINUTES*60_000;
  if(!state||Date.now()-state.heartbeatAt.valueOf()>staleMs)throw new Error("Scheduler heartbeat is stale");
}

main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;}).finally(()=>db.$disconnect());
