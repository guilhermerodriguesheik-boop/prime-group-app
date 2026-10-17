import { sendScheduledWhatsAppMessage } from "@/lib/whatsapp/worker";
import {ensurePluggyWebhooks} from "@/lib/banks/webhook-setup";

type OutboxItem={id:string;phone:string;message:string;bankTransactionId:string|null};
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
/** Queue bounded pages so large daily imports do not leave most movements until tomorrow. */
export async function queueBankReviewDigests(maxBatches=6){
 let queued=0;
 for(let i=0;i<Math.min(Math.max(maxBatches,1),8);i++){
  const added=await primeRpc<number>("prime_queue_bank_review_digest",{});
  queued+=Math.max(0,Number(added)||0);
  if(!added)break;
 }
 return queued;
}

export async function runPrimeOutbox(maxBatches=1){
 if(process.env.WHATSAPP_PROVIDER!=="evolution_go")return {sent:0,disabled:true};
 let sent=0,claimed=0,failed=0;
 for(let batch=0;batch<Math.min(Math.max(maxBatches,1),5);batch++){
  const items=await primeRpc<OutboxItem[]>("prime_claim_outbox",{p_limit:8});
  if(!items.length)break;
  claimed+=items.length;
  // Sequential sends for the same phone avoid bursts of interactive messages.
  // Each claimed row has bounded attempts and a dedupe key in PostgreSQL.
  for(let offset=0;offset<items.length;offset+=3){
   const wave=await Promise.all(items.slice(offset,offset+3).map(async item=>{
    try{
     if(!/^[0-9]{10,15}$/.test(item.phone))throw new Error("Invalid linked recipient");
     await sendScheduledWhatsAppMessage(item.phone,item.message,item.bankTransactionId?item.id:null);
     await primeRpc("prime_finish_outbox",{p_id:item.id,p_success:true});
     return true;
    }catch(err){
     const reason=err instanceof Error?err.message:"Unavailable";
     await primeRpc("prime_finish_outbox",{p_id:item.id,p_success:false,p_error:reason}).catch(()=>undefined);
     return false;
    }
   }));
   sent+=wave.filter(Boolean).length;
   failed+=wave.filter(ok=>!ok).length;
  }
  if(items.length<8)break;
 }
 return {claimed,sent,failed};
}
export async function runPrimeDailyJobs(){
 let pluggyEvents:unknown;
 try{pluggyEvents=await ensurePluggyWebhooks();}
 catch(error){
  console.error("Pluggy webhook setup pending",error instanceof Error?error.message:"unknown");
  pluggyEvents={configured:false};
 }
 const bills=await primeRpc<number>("prime_materialize_bills",{});
 const reports=await primeRpc<number>("prime_queue_scheduled_reports",{});
 const collections=await primeRpc<number>("prime_queue_contact_collections",{});
 const payroll=await primeRpc<number>("prime_queue_friday_payroll",{});
 const messages=await runPrimeOutbox(2);
 return {pluggyEvents,bills,reports,collections,payroll,messages};
}
