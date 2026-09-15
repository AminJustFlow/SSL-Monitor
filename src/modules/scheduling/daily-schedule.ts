const formatterCache=new Map<string,Intl.DateTimeFormat>();

function parts(date:Date,timeZone:string){
  let formatter=formatterCache.get(timeZone);
  if(!formatter){
    formatter=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
    formatterCache.set(timeZone,formatter);
  }
  return Object.fromEntries(formatter.formatToParts(date).filter(x=>x.type!=="literal").map(x=>[x.type,x.value])) as Record<string,string>;
}

export function localDateKey(date:Date,timeZone:string){
  const p=parts(date,timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function isDailyScheduleDue(date:Date,timeZone:string,scheduledTime:string){
  const p=parts(date,timeZone);
  const [hour,minute]=scheduledTime.split(":").map(Number);
  return Number(p.hour)*60+Number(p.minute)>=hour*60+minute;
}

export function retryDelayMs(completedAttempts:number){
  return completedAttempts===1?15*60_000:completedAttempts===2?60*60_000:undefined;
}

export function decideDailyRun(runs:Array<{status:string;attempt:number;startedAt:Date;completedAt:Date|null}>,now:Date):{status:"COMPLETED"}|{status:"EXHAUSTED"}|{status:"RETRY_WAIT"}|{status:"RUN";attempt:number}{
  if(runs.some(run=>run.status==="COMPLETED"))return {status:"COMPLETED"};
  const last=[...runs].sort((a,b)=>b.attempt-a.attempt||b.startedAt.valueOf()-a.startedAt.valueOf())[0];
  if(!last)return {status:"RUN",attempt:1};
  if(last.attempt>=3)return {status:"EXHAUSTED"};
  const delay=retryDelayMs(last.attempt);
  const ended=last.completedAt??last.startedAt;
  if(delay!==undefined&&now.valueOf()-ended.valueOf()<delay)return {status:"RETRY_WAIT"};
  return {status:"RUN",attempt:last.attempt+1};
}
