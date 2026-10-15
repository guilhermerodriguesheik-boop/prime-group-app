import {pluggyAccounts,pluggyApiKey,pluggyItem,pluggyTransactions} from "@/lib/banks/pluggy";
import {primeRpc,runPrimeOutbox} from "@/lib/whatsapp/prime-automations";
type BankEvent={id:string;itemId:string;event:string};
async function ingest(itemId:string){
 const key=await pluggyApiKey();
 const item=await pluggyItem(key,itemId);
 if(item.id!==itemId)throw new Error("Pluggy item mismatch");
 if(item.status!=="UPDATED")throw new Error("Bank data not ready: "+(item.status||"unknown"));
 const accounts=await pluggyAccounts(key,itemId);
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
   await primeRpc("prime_bank_import_event",{
    p_item_id:itemId,p_account_id:account.id,p_rows:rows.slice(pos,pos+80),
   });
  }
 }
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
 if(completed)await runPrimeOutbox();
 return {claimed:items.length,completed,failed};
}
