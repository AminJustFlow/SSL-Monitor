import nodemailer from "nodemailer";
import { config } from "@/lib/config";
export async function sendEmail(to: string, subject: string, text: string, html: string) {
  const cfg=config();
  if(cfg.EMAIL_PROVIDER==="resend"){
    if(!cfg.RESEND_API_KEY||!cfg.RESEND_FROM) throw new Error("Resend is not configured");
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"authorization":`Bearer ${cfg.RESEND_API_KEY}`,"content-type":"application/json"},
      body:JSON.stringify({from:cfg.RESEND_FROM,to:[to],subject,text,html}),
      signal:AbortSignal.timeout(15000)
    });
    const body=await response.json() as {id?:string;message?:string};
    if(!response.ok||!body.id) throw new Error(`Resend delivery failed (${response.status}): ${body.message??"Unknown provider error"}`);
    return {messageId:body.id};
  }
  if (!cfg.SMTP_HOST || !cfg.SMTP_FROM) throw new Error("SMTP is not configured");
  const transport=nodemailer.createTransport({host:cfg.SMTP_HOST,port:cfg.SMTP_PORT,secure:cfg.SMTP_SECURE,auth:cfg.SMTP_USER?{user:cfg.SMTP_USER,pass:cfg.SMTP_PASSWORD}:undefined});
  return transport.sendMail({from:cfg.SMTP_FROM,to,subject,text,html});
}
