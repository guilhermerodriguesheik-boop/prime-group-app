import {pluggyApiKey} from "@/lib/banks/pluggy";

const events=["item/updated","transactions/created"] as const;
export async function ensurePluggyWebhooks(){
 const secret=process.env.PLUGGY_WEBHOOK_SECRET||"";
 const site=process.env.NEXT_PUBLIC_SITE_URL||"";
 if(secret.length<32||!site.startsWith("https://"))
  return {configured:false,reason:"PLUGGY_WEBHOOK_SECRET or NEXT_PUBLIC_SITE_URL missing"};
 const target=new URL("/api/banks/webhook",site).toString();
 const key=await pluggyApiKey();
 const r=await fetch("https://api.pluggy.ai/webhooks",{
  headers:{"X-API-KEY":key},cache:"no-store",signal:AbortSignal.timeout(12000),
 });
 if(!r.ok)throw Error("Pluggy webhooks GET failed "+r.status);
 const body=await r.json() as {results?:{event:string;url:string}[]};
 const existing=body.results||[];
 const created:string[]=[];
 for(const event of events){
  if(existing.some(row=>row.url===target&&row.event===event))continue;
  const result=await fetch("https://api.pluggy.ai/webhooks",{
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(12000),
   headers:{"X-API-KEY":key,"Content-Type":"application/json"},
   body:JSON.stringify({url:target,event,headers:{"X-Prime-Webhook-Key":secret}}),
  });
  if(!result.ok)throw Error("Pluggy webhook creation failed "+event+" HTTP "+result.status);
  created.push(event);
 }
 return {configured:true,created};
}
