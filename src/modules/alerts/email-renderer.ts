import type { Website } from "@prisma/client";
export function renderAlert(website: Website, type: string, details: string) {
  const subject=`[SSL Monitor] ${type}: ${website.websiteName}`;
  const text=`${website.clientName} — ${website.websiteName}\n${website.publicUrl}\nStatus: ${type}\n${details}\n\nRecommended action: investigate the certificate or availability issue.\n${process.env.APP_BASE_URL}/websites/${website.id}`;
  const html=`<h1>${escape(type)}: ${escape(website.websiteName)}</h1><p><strong>Client:</strong> ${escape(website.clientName)}</p><p><a href="${escape(website.publicUrl)}">${escape(website.publicUrl)}</a></p><p>${escape(details)}</p><p><strong>Recommended action:</strong> investigate the certificate or availability issue.</p>`;
  return {subject,text,html};
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
