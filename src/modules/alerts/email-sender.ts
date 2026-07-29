import nodemailer from "nodemailer";
import { config } from "@/lib/config";
export async function sendEmail(to: string, subject: string, text: string, html: string) {
  const cfg=config(); if (!cfg.SMTP_HOST || !cfg.SMTP_FROM) throw new Error("SMTP is not configured");
  const transport=nodemailer.createTransport({host:cfg.SMTP_HOST,port:cfg.SMTP_PORT,secure:cfg.SMTP_SECURE,auth:cfg.SMTP_USER?{user:cfg.SMTP_USER,pass:cfg.SMTP_PASSWORD}:undefined});
  return transport.sendMail({from:cfg.SMTP_FROM,to,subject,text,html});
}
