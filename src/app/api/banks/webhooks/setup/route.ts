import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {personalBankUserAllowed,pluggyApiKey} from "@/lib/banks/pluggy";

export const runtime="nodejs";
const events=["item/updated","transactions/created"] as const;
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)return NextResponse.json({error:"Origem não autorizada."},{status:403});
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Faça login."},{status:401});
 if(!personalBankUserAllowed(user.id)||process.env.PLUGGY_PERSONAL_OWNER_ID!==user.id)
  return NextResponse.json({error:"Configuração exclusiva do proprietário."},{status:403});
 const secret=process.env.PLUGGY_WEBHOOK_SECRET||"";
 const site=process.env.NEXT_PUBLIC_SITE_URL||"";
 if(secret.length<32||!site.startsWith("https://"))
  return NextResponse.json({error:"Configure PLUGGY_WEBHOOK_SECRET e NEXT_PUBLIC_SITE_URL na Vercel."},{status:503});
 const target=new URL("/api/banks/webhook",site).toString();
 const key=await pluggyApiKey();
 const get=await fetch("https://api.pluggy.ai/webhooks",{
  headers:{"X-API-KEY":key},cache:"no-store",signal:AbortSignal.timeout(12000),
 });
 if(!get.ok)return NextResponse.json({error:"Não foi possível consultar os webhooks."},{status:502});
 const json=await get.json() as {results?:{event:string;url:string}[]};
 const existing=json.results||[];
 const created:string[]=[];
 for(const event of events){
  if(existing.some(w=>w.url===target&&w.event===event))continue;
  const response=await fetch("https://api.pluggy.ai/webhooks",{
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(12000),
   headers:{"X-API-KEY":key,"Content-Type":"application/json"},
   body:JSON.stringify({
    url:target,event,headers:{"X-Prime-Webhook-Key":secret},
   }),
  });
  if(!response.ok)return NextResponse.json({error:"A Pluggy recusou o evento "+event+" (HTTP "+response.status+").",created},{status:502});
  created.push(event);
 }
 return NextResponse.json({ok:true,created,registered:events.length});
}
