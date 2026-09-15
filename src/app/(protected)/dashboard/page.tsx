import Link from "next/link";
import { CheckStatus } from "@prisma/client";
import { db } from "@/lib/database";
import { config } from "@/lib/config";
import { csrfToken } from "@/lib/auth/csrf";
import { WebsiteActions } from "@/components/website-actions";

export default async function Dashboard({searchParams}:{searchParams:Promise<{q?:string;status?:string}>}){
  const p=await searchParams,csrf=await csrfToken(),cfg=config();
  const status=Object.values(CheckStatus).includes(p.status as CheckStatus)?p.status as CheckStatus:undefined;
  const where={...(p.q?{OR:[{clientName:{contains:p.q,mode:"insensitive" as const}},{websiteName:{contains:p.q,mode:"insensitive" as const}},{hostname:{contains:p.q,mode:"insensitive" as const}}]}:{}),...(status?{lastStatus:status}:{})};
  const [websites,total,healthy,w30,w14,bad,latest,scheduler,failedAlerts,missingOrigins]=await Promise.all([
    db.website.findMany({where,orderBy:{clientName:"asc"},include:{certificateChecks:{take:6,orderBy:{checkedAt:"desc"}},httpChecks:{take:1,orderBy:{checkedAt:"desc"}}}}),
    db.website.count(),db.website.count({where:{lastStatus:"HEALTHY"}}),db.website.count({where:{lastStatus:{in:["WARNING","URGENT","CRITICAL"]}}}),db.website.count({where:{lastStatus:{in:["URGENT","CRITICAL"]}}}),db.website.count({where:{lastStatus:{in:["EXPIRED","INVALID","UNAVAILABLE"]}}}),
    db.monitoringRun.findFirst({where:{triggerType:"SCHEDULED"},orderBy:{startedAt:"desc"}}),db.schedulerState.findUnique({where:{id:"singleton"}}),db.alertEvent.count({where:{deliveryStatus:"FAILED"}}),db.website.count({where:{enabled:true,OR:[{connectionType:{in:["CLOUDFLARE","CDN"]}},{usesCloudflare:true}],checkOriginCertificate:false}})
  ]);
  const schedulerStale=cfg.DAILY_MONITORING_ENABLED&&(!scheduler||Date.now()-scheduler.heartbeatAt.valueOf()>cfg.SCHEDULER_STALE_MINUTES*60_000);
  const exhausted=latest&&latest.attempt>=3&&latest.status!=="COMPLETED";
  return <>
    <h1>Dashboard</h1>
    {schedulerStale&&<p className="error"><strong>Daily automation is stale.</strong> The scheduler has not reported a heartbeat within {cfg.SCHEDULER_STALE_MINUTES} minutes.</p>}
    {exhausted&&<p className="error"><strong>Daily monitoring failed after three attempts.</strong> Check the latest run and service logs.</p>}
    {failedAlerts>0&&<p className="error"><strong>{failedAlerts} email alert{failedAlerts===1?" has":"s have"} exhausted delivery retries.</strong> Verify the email provider settings.</p>}
    {missingOrigins>0&&<p className="error"><strong>{missingOrigins} proxied website{missingOrigins===1?" is":"s are"} missing origin monitoring.</strong> Their edge certificate date does not represent the hidden origin certificate.</p>}
    <section className="cards"><Card n={total} t="Total websites"/><Card n={healthy} t="Healthy"/><Card n={w30} t="Expiring ≤30 days"/><Card n={w14} t="Expiring ≤14 days"/><Card n={bad} t="Expired / invalid / unavailable"/><Card n={latest?.checksFailed??0} t="Latest run failures"/></section>
    <p className="muted">Latest daily job: {latest?`${latest.status} — ${latest.completedAt?.toLocaleString()??"running"} (attempt ${latest.attempt})`:"No runs yet"} · Scheduler: {scheduler?.heartbeatAt?`heartbeat ${scheduler.heartbeatAt.toLocaleString()}`:"no heartbeat"}</p>
    <form className="panel actions"><input name="q" placeholder="Search client, website, or host" defaultValue={p.q}/><select name="status" defaultValue={p.status}><option value="">All statuses</option>{Object.values(CheckStatus).map(s=><option key={s}>{s}</option>)}</select><button>Filter</button></form>
    <div className="table-wrap panel"><table><thead><tr><th>Client / website</th><th>Overall</th><th>Public / Edge certificate</th><th>Origin certificate</th><th>HTTP</th><th>Connection</th><th>Last checked</th><th>Actions</th></tr></thead><tbody>{websites.map(w=>{const edge=w.certificateChecks.find(c=>c.checkType==="PUBLIC"),origin=w.certificateChecks.find(c=>c.checkType==="ORIGIN"),h=w.httpChecks[0],proxied=w.connectionType==="CLOUDFLARE"||w.connectionType==="CDN"||w.usesCloudflare;return <tr key={w.id}><td><strong>{w.clientName}</strong><br/><a href={w.publicUrl} target="_blank" rel="noreferrer">{w.websiteName}</a><br/><span className="muted">{w.hostname}</span></td><td><Badge s={w.lastStatus}/></td><td><CertificateCell check={edge}/>{proxied&&<><br/><span className="muted">Managed edge; origin expiry is actionable</span></>}</td><td>{w.checkOriginCertificate?<CertificateCell check={origin}/>:<><Badge s="UNKNOWN"/><br/>{proxied?"Origin not monitored":"Not configured"}</>}</td><td><Badge s={h?.status??"UNKNOWN"}/><br/>{h?.statusCode??"—"}</td><td>{w.connectionType.replace("_"," ")}<br/>{w.checkOriginCertificate?`${w.originConnectHost}:${w.originPort}`:"No origin"}</td><td>{w.lastCheckedAt?.toLocaleString()??"Never"}</td><td><WebsiteActions id={w.id} enabled={w.enabled} csrf={csrf}/><Link href={`/websites/${w.id}`}>Details</Link></td></tr>})}</tbody></table></div>
  </>;
}

function CertificateCell({check}:{check:{status:string;expiresAt:Date|null;daysRemaining:number|null}|undefined}){return <><Badge s={check?.status??"UNKNOWN"}/><br/>{check?.expiresAt?.toISOString()??"No check"}<br/>{check?.daysRemaining??"—"} full days</>;}
function Card({n,t}:{n:number;t:string}){return <div className="card"><div className="metric">{n}</div><div>{t}</div></div>}
function Badge({s}:{s:string}){return <span className={`badge ${s}`}>● {s}</span>}
