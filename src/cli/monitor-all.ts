import { monitorAll } from "@/modules/monitoring/monitor-all";
import { db } from "@/lib/database";
monitorAll("SCHEDULED").then(result=>{console.log(JSON.stringify(result));}).catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;}).finally(()=>db.$disconnect());
