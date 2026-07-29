"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { verifyCsrf } from "@/lib/auth/csrf";
import { sendEmail } from "@/modules/alerts/email-sender";
import { config } from "@/lib/config";

export async function testSmtp(form:FormData){
  await requireUser();
  await verifyCsrf(form.get("csrf"));
  const to=String(form.get("recipient")||config().DEFAULT_ALERT_RECIPIENTS.split(",")[0]||"");
  if(!to) redirect("/settings?smtp=missing-recipient");
  try {
    await sendEmail(to,`[${config().APP_NAME}] SMTP test`,"SMTP delivery is working.","<p>SMTP delivery is working.</p>");
  } catch (error) {
    const message=error instanceof Error?error.message:"";
    if(/535|authentication|EAUTH/i.test(message)) redirect("/settings?smtp=authentication-failed");
    redirect("/settings?smtp=delivery-failed");
  }
  redirect("/settings?smtp=sent");
}
