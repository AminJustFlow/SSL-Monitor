import { db } from "@/lib/database"; import { monitorWebsite } from "@/modules/monitoring/monitor-website";
const index=process.argv.indexOf("--id"); const id=index>=0?process.argv[index+1]:undefined;
if(!id){console.error("Usage: npm run monitor:website -- --id WEBSITE_ID");process.exitCode=1;}else{db.website.findUnique({where:{id}}).then(w=>{if(!w)throw new Error("Website not found");return monitorWebsite(w);}).then(console.log).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());}
