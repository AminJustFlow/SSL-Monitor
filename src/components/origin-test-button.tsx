"use client";
import { useState } from "react";

export function OriginTestButton({csrf}:{csrf:string}){
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  async function test(event:React.MouseEvent<HTMLButtonElement>){
    event.preventDefault(); const form=event.currentTarget.form;if(!form)return;
    const data=new FormData(form);let publicUrl=String(data.get("publicUrl")??"");if(!publicUrl.includes("://"))publicUrl=`https://${publicUrl}`;
    let hostname="";try{hostname=new URL(publicUrl).hostname;}catch{setMessage("Enter a valid public URL first.");return;}
    setBusy(true);setMessage("Testing an actual TLS handshake...");
    try{const response=await fetch("/api/websites/test-origin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({csrf,hostname,originConnectHost:data.get("originConnectHost"),originSniHostname:data.get("originSniHostname"),originPort:Number(data.get("originPort")||443),connectionType:data.get("connectionType"),usesCloudflare:data.get("usesCloudflare")==="on"})});const result=await response.json() as {error?:string;status?:string;issuer?:Record<string,string>;expiresAt?:string;resolvedIp?:string;hostnameMatches?:boolean;authorized?:boolean};if(!response.ok)throw new Error(result.error||"Test failed");setMessage(`Status: ${result.status}; expires: ${result.expiresAt??"unknown"}; IP: ${result.resolvedIp??"unknown"}; hostname: ${result.hostnameMatches?"valid":"invalid"}; chain: ${result.authorized?"valid":"invalid"}.`);}catch(error){setMessage(error instanceof Error?error.message:"Test failed");}finally{setBusy(false);}
  }
  return <div className="full"><button type="button" onClick={test} disabled={busy}>{busy?"Testing origin...":"Test origin connection"}</button>{message&&<p className="muted" role="status">{message}</p>}</div>;
}
