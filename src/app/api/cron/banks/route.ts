import {timingSafeEqual} from "node:crypto";
import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {syncBankConnection} from "@/lib/banks/sync";
import {pluggyReady} from "@/lib/banks/pluggy";
import {ensurePluggyWebhooks} from "@/lib/banks/webhook-setup";
import {queueBankReviewDigests,runPrimeOutbox} from "@/lib/whatsapp/prime-automations";

export const runtime="nodejs";
export const maxDuration=60;
const respond=(body:unknown,status=200)=>NextResponse.json(body,{
 status,headers:{"Cache-Control":"no-store"}
});
function authorized(req:Request){
 const secret=process.env.CRON_SECRET||"";
 const supplied=req.headers.get("authorization")?.replace(/^Bearer /,"")||"";
 const a=Buffer.from(secret),b=Buffer.from(supplied);
 return a.length>=24&&a.length===b.length&&timingSafeEqual(a,b);
}
/** Daily catch-up of the bank data *already available* at Pluggy.
 * A MeuPluggy proxy cannot force the original bank to refresh.
 * No mutations to cashbook, loans, expenses or bank accounts at the institution.
 */
export async function GET(req:Request){
 if(!authorized(req))return respond({error:"Unauthorized"},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key||!pluggyReady())return respond({error:"Bank import not configured"},503);
 const db=createClient(url,key,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const {data:connections,error}=await db.from("bank_connections")
  .select("id,owner_id,workspace_id,provider_item_id,status,display_name,last_synced_at")
  .eq("provider","pluggy").is("archived_at",null)
  .in("status",["connected","attention"]).limit(10);
 if(error)return respond({error:"Could not read bank connections"},503);
 let webhooks:"ready"|"pending"="pending";
 let webhookError:string|null=null;
 try{
  const result=await ensurePluggyWebhooks();
  webhooks=result.configured&&result.verified?"ready":"pending";
  if(webhooks!=="ready")webhookError="A Pluggy não confirmou a inscrição.";
 }catch(e){
  webhookError=e instanceof Error?e.message.slice(0,180):"Verificação indisponível";
  console.error("Bank webhooks unavailable",webhookError);
 }
 const bankIds=(connections||[]).map(c=>c.id);
 if(bankIds.length){
  const {error:saveError}=await db.from("bank_connections").update({
   webhook_check_at:new Date().toISOString(),
   webhook_check_status:webhooks==="ready"?"verified":"failed",
   webhook_check_error:webhooks==="ready"?null:webhookError,
  }).in("id",bankIds);
  if(saveError)console.error("Bank webhook audit failed",saveError.code);
 }
 const results=await Promise.all((connections||[]).map(async connection=>{
  try{
   const result=await syncBankConnection(db,connection,45);
   return {ok:true,connection:connection.id,checked:result.transactions,
    newTransactions:result.newTransactions,sourceUpdatedAt:result.providerUpdatedAt,
    importedAt:result.at};
  }catch(e){
   console.error("Bank daily read unavailable",connection.id,e instanceof Error?e.message:"unknown");
   return {ok:false,connection:connection.id,error:"Unable to import available bank data"};
  }
 }));
 const failed=results.filter(r=>!r.ok).length;
 let digest:unknown={queued:0};
 try{
  const queued=await queueBankReviewDigests();
  // Same outgoing WhatsApp queue used by existing daily reminders.
  const messages=queued>0?await runPrimeOutbox():{sent:0};
  digest={queued,messages};
 }catch(error){
  console.error("Bank review summary pending",error instanceof Error?error.message:"unknown");
  digest={error:"digest_queued_for_retry"};
 }
 return respond({processed:results.length,failed,webhooks,results,digest},failed?503:200);
}
