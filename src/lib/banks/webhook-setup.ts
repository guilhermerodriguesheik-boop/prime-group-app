import {pluggyApiKey} from "@/lib/banks/pluggy";
import {PLUGGY_BANK_EVENTS} from "@/lib/banks/pluggy-webhook-events";
import {webhookReady,webhookNeedsRepair,type PluggyWebhookMetadata} from "@/lib/banks/webhook-health";
const events=PLUGGY_BANK_EVENTS;

async function fetchWebhooks(key:string):Promise<PluggyWebhookMetadata[]>{
 const list:PluggyWebhookMetadata[]=[];
 for(let page=1;page<=10;page++){
  const endpoint=new URL("https://api.pluggy.ai/webhooks");
  endpoint.searchParams.set("page",String(page));
  const r=await fetch(endpoint,{headers:{"X-API-KEY":key},
   cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error("Pluggy GET /webhooks HTTP "+r.status);
  const body=await r.json() as {results?:PluggyWebhookMetadata[];totalPages?:number};
  if(!Array.isArray(body.results))throw Error("Resposta de webhooks inválida.");
  list.push(...body.results);
  if(typeof body.totalPages!=="number"||page>=body.totalPages)return list;
 }
 throw Error("Muitos webhooks para validar com segurança.");
}
export async function ensurePluggyWebhooks(){
 const secret=process.env.PLUGGY_WEBHOOK_SECRET||"";
 const site=process.env.NEXT_PUBLIC_SITE_URL||"";
 if(secret.length<32||!site.startsWith("https://"))
  return {configured:false,reason:"PLUGGY_WEBHOOK_SECRET or NEXT_PUBLIC_SITE_URL missing"};
 const target=new URL("/api/banks/webhook",site).toString();
 const key=await pluggyApiKey();
 const before=await fetchWebhooks(key);
 const created:string[]=[];
 const repaired:string[]=[];
 for(const event of events){
  const hook=before.find(row=>row.url===target&&row.event===event);
  if(hook&&webhookReady(hook,target,event,secret))continue;
  const payload=hook?{enabled:true,headers:{"X-Prime-Webhook-Key":secret}}:
    {url:target,event,headers:{"X-Prime-Webhook-Key":secret}};
  const url=hook?"https://api.pluggy.ai/webhooks/"+encodeURIComponent(hook.id):
    "https://api.pluggy.ai/webhooks";
  const response=await fetch(url,{
   method:hook?"PATCH":"POST",cache:"no-store",signal:AbortSignal.timeout(12000),
   headers:{"X-API-KEY":key,"Content-Type":"application/json"},
   body:JSON.stringify(payload),
  });
  if(!response.ok)throw Error("Pluggy webhook "+(hook?"repair":"create")+" HTTP "+response.status);
  if(hook)repaired.push(event);else created.push(event);
 }
 // Never report success based only on a POST/PATCH response.
 const verified=await fetchWebhooks(key);
 const healthy=events.every(event=>verified.some(hook=>webhookReady(hook,target,event,secret)));
 if(!healthy)throw Error("A Pluggy não confirmou o webhook ativo com a chave correta.");
 return {configured:true,created,repaired,verified:true};
}
