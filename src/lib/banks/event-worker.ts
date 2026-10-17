import {pluggyAccounts,pluggyApiKey,pluggyItem,pluggyTransactions} from "@/lib/banks/pluggy";
import {primeRpc,runPrimeOutbox} from "@/lib/whatsapp/prime-automations";
import {createClient} from "@supabase/supabase-js";
import {allowPersonalItem} from "@/lib/banks/sync";
type BankEvent={id:string;itemId:string;event:string};
async function ingest(itemId:string){
 const key=await pluggyApiKey();
 const item=await pluggyItem(key,itemId);
 if(item.id!==itemId)throw new Error("Pluggy item mismatch");
 if(item.status!=="UPDATED")throw new Error("Bank data not ready: "+(item.status||"unknown"));
 const accounts=await pluggyAccounts(key,itemId);
 // The event bridge handles alert deduplication; a separate owner-verified
 // status update refreshes displayed balances and the source freshness marker.
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!secret)throw new Error("Bank metadata sync not configured");
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:connection,error:lookupError}=await db.from("bank_connections")
  .select("id,owner_id,workspace_id").eq("provider","pluggy").eq("provider_item_id",itemId)
  .is("archived_at",null).neq("status","disconnected").maybeSingle();
 if(lookupError||!connection)throw new Error("Bank webhook without active connection");
 if(!allowPersonalItem(connection.owner_id,item.clientUserId))
  throw new Error("Bank webhook owner mismatch");
 let counted=0,newlyAdded=0;
 for(const account of accounts.slice(0,15)){
  if(!account.id||account.type!=="BANK")continue;
  const dateFrom=new Date(Date.now()-7*86400_000).toISOString().slice(0,10);
  const transactions=await pluggyTransactions(key,account.id,dateFrom,5);
  const rows=transactions.filter(t=>t.id&&t.date&&Number.isFinite(t.amount)&&Math.abs(t.amount||0)<=100000000)
   .map(t=>({
    id:t.id,date:t.date!.slice(0,10),description:(t.description||t.descriptionRaw||"Movimentação").slice(0,350),
    amount:Math.abs(t.amount!),direction:t.type==="DEBIT"?"debit":t.type==="CREDIT"?"credit":t.amount!<0?"debit":"credit",
    status:t.status==="PENDING"?"PENDING":"POSTED",
   }));
  for(let pos=0;pos<rows.length;pos+=80){
   const batch=rows.slice(pos,pos+80);
   const added=await primeRpc<number>("prime_bank_import_event",{
    p_item_id:itemId,p_account_id:account.id,p_rows:batch,
   });
   counted+=batch.length;
   newlyAdded+=Number(added)||0;
  }
 }
 const at=new Date().toISOString();
 for(const account of accounts){
  if(!account.id||!["BANK","CREDIT"].includes(account.type||""))continue;
  const value=typeof account.balance==="number"&&Number.isFinite(account.balance)
   &&Math.abs(account.balance)<=1000000000?account.balance:null;
  const {error:balanceError}=await db.from("bank_accounts").update({
   balance:value,balance_updated_at:at,updated_at:at
  }).eq("connection_id",connection.id).eq("owner_id",connection.owner_id)
    .eq("provider_account_id",account.id);
  if(balanceError)throw new Error("Unable to refresh bank balance metadata");
 }
 const origin=item.lastUpdatedAt?new Date(item.lastUpdatedAt):null;
 const providerDate=origin&&!Number.isNaN(origin.getTime())?origin.toISOString():null;
 const {error:statusError}=await db.from("bank_connections").update({
  status:"connected",last_synced_at:at,last_error:null,updated_at:at,
  last_new_transaction_count:newlyAdded,last_scanned_transaction_count:counted,
  ...(providerDate?{provider_last_updated_at:providerDate}:{}),
 }).eq("id",connection.id).eq("owner_id",connection.owner_id);
 if(statusError)throw new Error("Unable to refresh bank connection metadata");
}
export async function drainPluggyEventInbox(limit=2){
 const items=await primeRpc<BankEvent[]>("prime_claim_pluggy_events",{p_limit:limit});
 let completed=0,failed=0;
 for(const item of items){
  try{
   await ingest(item.itemId);
   await primeRpc("prime_finish_pluggy_event",{p_event_id:item.id,p_success:true});
   completed++;
  }catch(err){
   const reason=err instanceof Error?err.message:"Import failed";
   await primeRpc("prime_finish_pluggy_event",{p_event_id:item.id,p_success:false,p_error:reason}).catch(()=>undefined);
   failed++;
  }
 }
 if(completed){
  // Consolidates only newly imported POSTED movements, including all active accounts.
  const queued=await primeRpc<number>("prime_queue_bank_review_digest",{}).catch(error=>{
   console.error("Bank digest queue failed",error instanceof Error?error.message:"unknown");return 0;
  });
  if(queued>0)await runPrimeOutbox();
 }
 return {claimed:items.length,completed,failed};
}
