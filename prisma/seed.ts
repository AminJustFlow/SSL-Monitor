import { PrismaClient } from "@prisma/client"; import argon2 from "argon2";
const db=new PrismaClient();
async function main(){const email=process.env.INITIAL_ADMIN_EMAIL?.toLowerCase();const password=process.env.INITIAL_ADMIN_PASSWORD;const name=process.env.INITIAL_ADMIN_NAME??"Administrator";if(!email||!password||password.length<12)throw new Error("INITIAL_ADMIN_EMAIL and an INITIAL_ADMIN_PASSWORD of at least 12 characters are required");await db.user.upsert({where:{email},update:{name,enabled:true},create:{email,name,passwordHash:await argon2.hash(password)}});console.log(`Administrator ready: ${email}`);}
main().finally(()=>db.$disconnect());
