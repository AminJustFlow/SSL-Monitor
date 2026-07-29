import { PrismaClient } from "@prisma/client"; import argon2 from "argon2";
const db=new PrismaClient();
async function main(){const email=process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();const password=process.env.INITIAL_ADMIN_PASSWORD;const name=process.env.INITIAL_ADMIN_NAME??"Administrator";if(!email||!password||password.length<12)throw new Error("INITIAL_ADMIN_EMAIL and an INITIAL_ADMIN_PASSWORD of at least 12 characters are required");const passwordHash=await argon2.hash(password);await db.user.upsert({where:{email},update:{name,enabled:true,passwordHash},create:{email,name,passwordHash}});console.log(`Administrator ready: ${email}`);}
main().finally(()=>db.$disconnect());
