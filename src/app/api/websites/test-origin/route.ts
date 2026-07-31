import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { verifyCsrf } from "@/lib/auth/csrf";
import { config } from "@/lib/config";
import { checkCertificate } from "@/modules/certificates/certificate-checker";

export async function POST(request:Request){
  if(!await currentUser()) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json() as {csrf?:string;originConnectHost?:string;originSniHostname?:string;hostname?:string;originPort?:number};
  await verifyCsrf(body.csrf??null);
  const connectHost=body.originConnectHost?.trim();
  const servername=body.originSniHostname?.trim()||body.hostname?.trim();
  const port=Number(body.originPort||443);
  if(!connectHost||!servername) return NextResponse.json({error:"Origin address and TLS hostname are required"},{status:400});
  if(!config().ALLOWED_TLS_PORTS.split(",").map(Number).includes(port)) return NextResponse.json({error:"Origin port is not approved"},{status:400});
  const result=await checkCertificate({connectHost,servername,port,allowPrivate:config().ALLOW_PRIVATE_ORIGIN_HOSTS});
  return NextResponse.json({...result,validFrom:result.validFrom?.toISOString(),expiresAt:result.expiresAt?.toISOString()});
}
