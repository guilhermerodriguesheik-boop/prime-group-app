import { sendScheduledWhatsAppMessage } from "@/lib/whatsapp/worker";
import {ensurePluggyWebhooks} from "@/lib/banks/webhook-setup";
import {parseEvolutionGoDeliveryStatus} from "@/lib/banks/evolution-go-delivery-status";

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

type OutboxReceipt={id:string;providerId:string};
async function checkDelivery(receipt:OutboxReceipt){
 const url=process.env.EVOLUTION_GO_API_URL||"";
 const key=process.env.EVOLUTION_GO_TOKEN||"";
 if(!url||!key)return;
 let delivery:"sent"|"delivered"|"read"|"unavailable"="unavailable";
 try {
  const address=new URL(url);
  if(address.protocol!=="https:"||address.username||address.password)
   throw Error("Invalid Evolution Go host");
  const base=address.href.replace(/\/+$/,"");
  const response=await fetch(base+"/message/status",{
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(3500),
   headers:{apikey:key,"Content-Type":"application/json"},
   body:JSON.stringify({id:receipt.providerId})
  });
  if(response.ok)delivery=parseEvolutionGoDeliveryStatus(await response.json());
 }catch { /* Provider can disable message history; HTTP acceptance is not delivery. */ }
 try{await primeRpc("prime_update_outbox_delivery_status",{
  p_id:receipt.id,p_provider_message_id:receipt.providerId,p_status:delivery
 });}catch(error){console.error("Unable to store Evolution Go delivery status",
  error instanceof Error?error.message:"unknown");}
}
/** Supported by Evolution Go only when DATABASE_SAVE_MESSAGES is enabled. */
export async function refreshBankDeliveryStatus(limit=12){
 if(process.env.WHATSAPP_PROVIDER!=="evolution_go")return {checked:0,disabled:true};
 const receipts=await primeRpc<OutboxReceipt[]>("prime_get_outbox_delivery_checks",{
  p_limit:Math.min(Math.max(limit,1),25)
 });
 for(let i=0;i<receipts.length;i+=3){
  await Promise.all(receipts.slice(i,i+3).map(checkDelivery));
 }
 return {checked:receipts.length};
}

export async function runPrimeOutbox(maxBatches=1){
 if(process.env.WHATSAPP_PROVIDER!=="evolution_go")return {sent:0,failed:0,claimed:0,disabled:true};
 let sent=0,claimed=0,failed=0;
 for(let batch=0;batch<Math.min(Math.max(maxBatches,1),5);batch++){
  const items=await primeRpc<OutboxItem[]>("prime_claim_outbox",{p_limit:8});
  if(!items.length)break;
  claimed+=items.length;
  // One carousel at a time for this phone. Parallel waves of three saturated
  // the session, while HTTP 200 never meant delivered/read by the WhatsApp client.
  for(const item of items){
   try{
    if(!/^[0-9]{10,15}$/.test(item.phone))throw new Error("Invalid linked recipient");
    const providerId=await sendScheduledWhatsAppMessage(
      item.phone,item.message,item.bankTransactionId?item.id:null);
    if(item.bankTransactionId){
     if(typeof providerId!=="string"||!providerId)
       throw Error("Interactive card has no provider message ID");
     const saved=await primeRpc<boolean>("prime_finish_outbox_with_provider",{
      p_id:item.id,p_provider_message_id:providerId
     });
     if(!saved)throw Error("Bank outbox claim not finalized");
    }else{
     await primeRpc("prime_finish_outbox",{p_id:item.id,p_success:true});
    }
    sent++;
   }catch(err){
    failed++;
    const reason=err instanceof Error?err.message:"Unavailable";
    // On an ambiguous provider/DB failure avoid making misleading claims of delivery.
    await primeRpc("prime_finish_outbox",{p_id:item.id,p_success:false,p_error:reason})
     .catch(()=>undefined);
   }
   // Pace image-backed carousels and allow the WhatsApp session to process acks.
   if(item.bankTransactionId)await new Promise<void>(resolve=>setTimeout(resolve,850));
  }
  if(items.length<8)break;
 }
 // Probe delivery separately; an HTTP send alone must never count as received.
 try{await refreshBankDeliveryStatus(12);}
 catch(error){console.error("Evolution Go delivery probe unavailable",
  error instanceof Error?error.message:"unknown");}
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
