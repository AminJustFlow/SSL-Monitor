import Link from "next/link";
import type { CertificateCheck } from "@prisma/client";
import { notFound } from "next/navigation";
import { db } from "@/lib/database";
import { config } from "@/lib/config";
import { csrfToken } from "@/lib/auth/csrf";
import { WebsiteActions } from "@/components/website-actions";

export default async function Details({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const w=await db.website.findUnique({where:{id},include:{certificateChecks:{take:40,orderBy:{checkedAt:"desc"}},httpChecks:{take:20,orderBy:{checkedAt:"desc"}},alerts:{take:20,orderBy:{createdAt:"desc"}}}});
  if(!w)notFound();
  const edge=w.certificateChecks.find(c=>c.checkType==="PUBLIC");
  const origin=w.certificateChecks.find(c=>c.checkType==="ORIGIN");
  const h=w.httpChecks[0];
  const proxied=w.connectionType==="CLOUDFLARE"||w.connectionType==="CDN"||w.usesCloudflare;
  const mismatch=Boolean(edge?.expiresAt&&origin?.expiresAt&&edge.expiresAt.valueOf()!==origin.expiresAt.valueOf());
  return <>
    <div className="actions"><h1>{w.clientName} — {w.websiteName}</h1><WebsiteActions id={id} enabled={w.enabled} csrf={await csrfToken()}/><Link className="button" href={`/websites/${id}/edit`}>Edit configuration</Link></div>
    {proxied&&<p className="panel">This website is behind {w.connectionType==="CLOUDFLARE"||w.usesCloudflare?"Cloudflare":"a CDN"}. The managed public edge and actionable origin certificates are monitored independently.</p>}
    {proxied&&!w.checkOriginCertificate&&<p className="error">Origin not monitored: configure the real origin connection host so the edge date is never mistaken for the origin expiry date.</p>}
    {mismatch&&<p className="panel">The public edge and origin certificates have different expiration dates, which is normal for a proxied website. Origin expiry alerts use the origin certificate shown below.</p>}
    <section className="grid"><CertificateCard title="Public / Edge Certificate" check={edge} notConfigured={!w.checkPublicCertificate}/><CertificateCard title="Origin Certificate" check={origin} notConfigured={!w.checkOriginCertificate}/></section>
    <section className="panel"><h2>HTTP availability</h2><p>Status: {h?.status??"UNKNOWN"} ({h?.statusCode??"—"})</p><p>Final URL: {h?.finalUrl??"—"}</p><p>Response time: {h?.responseTimeMs??"—"} ms</p><p>Redirects: {h?.redirectCount??"—"}</p></section>
    <h2>Recent certificate checks</h2><div className="table-wrap"><table><thead><tr><th>Date</th><th>Certificate</th><th>Status</th><th>Exact expiration (UTC)</th><th>Connected IP</th><th>Error</th></tr></thead><tbody>{w.certificateChecks.map(x=><tr key={x.id}><td>{formatLocal(x.checkedAt)}</td><td>{x.checkType==="PUBLIC"?"Public / Edge":"Origin"}</td><td>{statusLabel(x)}</td><td>{x.expiresAt?.toISOString()??"—"}</td><td>{x.resolvedIp??"—"}</td><td>{x.authorizationError??x.errorMessage??"—"}</td></tr>)}</tbody></table></div>
    <h2>Alert history</h2><div className="table-wrap"><table><tbody>{w.alerts.map(a=><tr key={a.id}><td>{formatLocal(a.createdAt)}</td><td>{a.alertType}</td><td>{a.recipient}</td><td>{a.deliveryStatus}</td></tr>)}</tbody></table></div>
  </>;
}

function CertificateCard({title,check,notConfigured}:{title:string;check?:CertificateCheck;notConfigured:boolean}){
  if(notConfigured)return <article className="panel"><h2>{title}</h2><p className="badge UNKNOWN">Not configured</p><p>No validity claim is made because this certificate was not checked.</p></article>;
  if(!check)return <article className="panel"><h2>{title}</h2><p className="badge UNKNOWN">Unknown</p><p>Configured, but no completed TLS check is available yet.</p></article>;
  return <article className="panel"><h2>{title}</h2><dl>
    <dt>Status</dt><dd><span className={`badge ${check.status}`}>{statusLabel(check)}</span></dd>
    <dt>Issuer</dt><dd>{displayName(check.issuer)}</dd><dt>Subject</dt><dd>{displayName(check.subject)}</dd>
    <dt>Exact expiration — local</dt><dd>{check.expiresAt?formatLocal(check.expiresAt):"—"}</dd>
    <dt>Exact expiration — UTC</dt><dd><code>{check.expiresAt?.toISOString()??"—"}</code></dd>
    <dt>Full days remaining</dt><dd>{check.daysRemaining??"—"} (floor rounding)</dd>
    <dt>Exact remaining time</dt><dd>{check.remainingMs===null?"—":`${check.remainingMs.toString()} ms`}</dd>
    <dt>Valid from</dt><dd>{check.validFrom?`${formatLocal(check.validFrom)} (${check.validFrom.toISOString()})`:"—"}</dd>
    <dt>Hostname validation</dt><dd>{check.hostnameValid?"Valid":"Invalid"}</dd><dt>Certificate chain</dt><dd>{check.chainValid?"Valid":"Invalid"}</dd>
    <dt>Last checked</dt><dd>{formatLocal(check.checkedAt)}</dd><dt>Connection</dt><dd>{check.connectHost}:{check.connectPort} → {check.resolvedIp??"unknown IP"}; SNI {check.sniHostname}</dd>
    <dt>Fingerprint</dt><dd><code>{check.fingerprint??"—"}</code></dd><dt>Error details</dt><dd>{check.authorizationError??check.errorMessage??"None"}</dd>
  </dl></article>;
}
function statusLabel(c:CertificateCheck){if(c.status==="INVALID"&&!c.hostnameValid)return "Hostname mismatch";if(c.status==="INVALID"&&!c.chainValid)return "Chain error";return c.status.replaceAll("_"," ").toLowerCase();}
function displayName(value:unknown){if(!value||typeof value!=="object")return "—";const record=value as Record<string,unknown>;return String(record.CN??(Object.entries(record).map(([k,v])=>`${k}=${String(v)}`).join(", ")||"—"));}
function formatLocal(date:Date){return new Intl.DateTimeFormat("en-US",{timeZone:config().MONITORING_TIMEZONE,dateStyle:"long",timeStyle:"long"}).format(date);}
