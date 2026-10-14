import { sendScheduledWhatsAppMessage } from "@/lib/whatsapp/worker";

type OutboxItem={id:string;phone:string;message:string};
function settings(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,apikey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const secret=process.env.WHATSAPP_INGRESS_SECRET;
 if(!url||!apikey||!secret||secret.length<24)throw new Error("Automation bridge unavailable");
 return {url,apikey,secret};
}
export async function primeRpc<T>(name:string,parameters:Record<string,unknown>):Promise<T>{
 const c=settings();
 const response=await fetch(c.url+"/rest/v1/rpc/"+encodeURIComponent(name),{
  method:"POST",cache:"no-store",signal:AbortSignal.timeout(14000),
  headers:{"Content-Type":"application/json",apikey:c.apikey,Authorization:"Bearer "+c.apikey},
  body:JSON.stringify({p_secret:c.secret,...parameters}),
 });
 if(!response.ok)throw new Error("Automation "+name+" failed (HTTP "+response.status+")");
 return response.json() as Promise<T>;
}
export async function runPrimeOutbox(){
 if(process.env.WHATSAPP_PROVIDER!=="evolution_go")return {sent:0,disabled:true};
 const items=await primeRpc<OutboxItem[]>("prime_claim_outbox",{p_limit:12});
 let sent=0,failed=0;
 for(const item of items){
  try{
   if(!/^[0-9]{10,15}$/.test(item.phone))throw new Error("Invalid linked recipient");
   await sendScheduledWhatsAppMessage(item.phone,item.message);
   await primeRpc("prime_finish_outbox",{p_id:item.id,p_success:true});
   sent++;
  }catch(err){
   const reason=err instanceof Error?err.message:"Unavailable";
   await primeRpc("prime_finish_outbox",{p_id:item.id,p_success:false,p_error:reason}).catch(()=>undefined);
   failed++;
  }
 }
 return {claimed:items.length,sent,failed};
}
export async function runPrimeDailyJobs(){
 const bills=await primeRpc<number>("prime_materialize_bills",{});
 const reports=await primeRpc<number>("prime_queue_scheduled_reports",{});
 const messages=await runPrimeOutbox();
 return {bills,reports,messages};
}
