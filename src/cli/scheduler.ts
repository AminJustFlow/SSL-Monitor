import { runScheduler } from "@/modules/scheduling/scheduler";

runScheduler().catch(error=>{
  console.error(error instanceof Error?error.message:error);
  process.exitCode=1;
});
