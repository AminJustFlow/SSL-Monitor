"use server";
import { revalidatePath } from "next/cache"; import { redirect } from "next/navigation"; import { requireUser } from "@/lib/auth/session"; import { verifyCsrf } from "@/lib/auth/csrf"; import { db } from "@/lib/database"; import { websiteSchema } from "@/lib/validation/website"; import { validatePublicUrl, assertPublicHost } from "@/lib/security/network"; import { config } from "@/lib/config"; import { monitorWebsite } from "@/modules/monitoring/monitor-website";
function object(form:FormData){return Object.fromEntries(form.entries())}
async function validated(form:FormData){
  const raw=object(form);
  let enteredUrl=String(raw.publicUrl??"").trim();
  if(!/^[a-z][a-z\d+.-]*:\/\//i.test(enteredUrl)) enteredUrl=`https://${enteredUrl}`;
  const url=await validatePublicUrl(enteredUrl);
  const data=websiteSchema.parse({
    ...raw,
    publicUrl:url.toString(),
    hostname:url.hostname.toLowerCase(),
    websiteName:String(raw.websiteName??"").trim()||url.hostname.toLowerCase(),
    port:raw.port||443,
    tlsTimeoutMs:raw.tlsTimeoutMs||10000,
    httpTimeoutMs:raw.httpTimeoutMs||15000,
    alertRecipients:raw.alertRecipients||config().DEFAULT_ALERT_RECIPIENTS,
    alertThresholds:raw.alertThresholds||"30,14,7,3,1,0",
    originSniHostname:String(raw.originSniHostname??"").trim()||url.hostname.toLowerCase()
  });
  if(!config().ALLOWED_TLS_PORTS.split(",").map(Number).includes(data.port))throw new Error("TLS port is not approved");
  if(data.checkOriginCertificate){if(!data.originConnectHost)throw new Error("An origin host is required when origin checks are enabled");await assertPublicHost(data.originConnectHost,config().ALLOW_PRIVATE_ORIGIN_HOSTS);}
  return {...data,publicUrl:url.toString(),originConnectHost:data.originConnectHost||null,originSniHostname:data.checkOriginCertificate?data.originSniHostname:null};
}
export async function createWebsite(form:FormData){await requireUser();await verifyCsrf(form.get("csrf"));const website=await db.website.create({data:await validated(form)});redirect(`/websites/${website.id}`)}
export async function updateWebsite(id:string,form:FormData){await requireUser();await verifyCsrf(form.get("csrf"));await db.website.update({where:{id},data:await validated(form)});redirect(`/websites/${id}`)}
export async function deleteWebsite(id:string,csrf:string){await requireUser();await verifyCsrf(csrf);await db.website.delete({where:{id}});revalidatePath("/dashboard")}
export async function toggleWebsite(id:string,csrf:string){await requireUser();await verifyCsrf(csrf);const w=await db.website.findUniqueOrThrow({where:{id},select:{enabled:true}});await db.website.update({where:{id},data:{enabled:!w.enabled}});revalidatePath("/dashboard")}
export async function checkNow(id:string,csrf:string){await requireUser();await verifyCsrf(csrf);const w=await db.website.findUniqueOrThrow({where:{id}});await monitorWebsite(w);revalidatePath("/dashboard");revalidatePath(`/websites/${id}`)}
