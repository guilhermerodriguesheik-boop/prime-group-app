import type { SupabaseClient } from "@supabase/supabase-js";
import { personalBankUserAllowed, pluggyAccounts, pluggyApiKey, pluggyItem, pluggyTransactions, type PluggyAccount } from "./pluggy";

// Works with the signed-in user's RLS client. It cannot access accounts
// belonging to another owner and does not post ledger transactions.
type BankDb = SupabaseClient;
type Connection = {
  id:string; owner_id:string; workspace_id:string;
  provider_item_id:string; status:string; display_name:string;
  last_synced_at:string|null;
};
function plainError(error:unknown){
  return (error instanceof Error ? error.message : "Erro bancário").slice(0,170);
}
const daysAgo=(days:number)=>new Date(Date.now()-days*86400_000).toISOString().slice(0,10);
function last4(value:string|undefined){
  return (value||"").replace(/\D/g,"").slice(-4)||null;
}
function validMoney(amount:unknown):amount is number{
  return typeof amount==="number" && Number.isFinite(amount) && Math.abs(amount)<=1_000_000_000;
}
function safeStatus(value:string|undefined){
  return value==="PENDING" ? "PENDING" : "POSTED";
}

export async function syncBankConnection(
  db: BankDb,
  connection: Connection,
  days=120
):Promise<{accounts:number;transactions:number;newTransactions:number;providerUpdatedAt:string|null;at:string}>{
  if(connection.status==="disconnected")throw new Error("Conexão desconectada.");
  let imported=0;
  let newlyAdded=0;
  try {
    const key=await pluggyApiKey();
    const item=await pluggyItem(key,connection.provider_item_id);
    // Recheck even existing rows: authenticated clients can write through RLS.
    if(item.id!==connection.provider_item_id || !allowPersonalItem(connection.owner_id,item.clientUserId))
      throw new Error("Item bancário não autorizado para este usuário.");
    if(item.status!=="UPDATED")
      throw new Error(item.status==="UPDATING" ? "O banco ainda está atualizando os dados. Tente novamente em instantes." :
        "A conexão precisa de atenção no Meu Pluggy. Confira a autorização do banco.");
    const parsedSourceDate=item.lastUpdatedAt?new Date(item.lastUpdatedAt):null;
    const providerUpdatedAt=parsedSourceDate&&!Number.isNaN(parsedSourceDate.getTime())
      ?parsedSourceDate.toISOString():null;
    const accounts=await pluggyAccounts(key,item.id);
    if(accounts.length>20)throw new Error("Número inesperado de contas.");
    if(!accounts.length)throw new Error("Nenhuma conta disponível. Confira o consentimento no Meu Pluggy.");
    for(const a of accounts){
      if(!a.id || !["BANK","CREDIT"].includes(a.type||""))continue;
      const at=new Date().toISOString();
      const data={
        owner_id:connection.owner_id,workspace_id:connection.workspace_id,
        connection_id:connection.id,provider_account_id:a.id,
        display_name:(a.marketingName||a.name||"Conta bancária").slice(0,120),
        account_last4:last4(a.number),kind:a.type,
        currency:(a.currencyCode||"BRL").slice(0,3),
        balance:validMoney(a.balance)?a.balance:null,
        balance_updated_at:at,updated_at:at,
      };
      const {data:stored,error:accountError}=await db.from("bank_accounts")
        .upsert(data,{onConflict:"connection_id,provider_account_id"})
        .select("id").single();
      if(accountError||!stored)throw new Error("Falha ao salvar conta bancária: "+(accountError?.code||"desconhecida"));
      const rows=await pluggyTransactions(key,a.id,daysAgo(days));
      for(let offset=0;offset<rows.length;offset+=150){
        const batch=rows.slice(offset,offset+150).filter(t=>
          !!t.id && !!t.date && validMoney(t.amount) &&
          !Number.isNaN(new Date(t.date).getTime())
        ).map(t=>({
          owner_id:connection.owner_id,workspace_id:connection.workspace_id,
          bank_account_id:stored.id,provider_transaction_id:t.id,
          occurred_on:t.date!.slice(0,10),
          description:(t.description||t.descriptionRaw||"Movimentação").slice(0,350),
          amount:Math.abs(t.amount!),
          // Pluggy CREDIT accounts use positive amounts for card charges, so sign alone is unsafe.
          direction:t.type==="DEBIT" ? "debit" : t.type==="CREDIT" ? "credit" :
            (t.amount! < 0 ? "debit" : "credit"),
          provider_status:safeStatus(t.status),
          category:(t.category||"").slice(0,100)||null,
          updated_at:at,
        }));
        if(batch.length){
          const ids=[...new Set(batch.map(row=>row.provider_transaction_id))];
          const {data:previous,error:lookupError}=await db.from("bank_transactions")
            .select("provider_transaction_id").eq("bank_account_id",stored.id)
            .in("provider_transaction_id",ids);
          if(lookupError)throw new Error("Falha ao conferir extratos existentes: "+lookupError.code);
          const known=new Set((previous||[]).map(row=>row.provider_transaction_id));
          const {error}=await db.from("bank_transactions")
            .upsert(batch,{onConflict:"bank_account_id,provider_transaction_id"});
          if(error)throw new Error("Falha ao salvar extrato: "+error.code);
          imported+=batch.length;
          newlyAdded+=ids.filter(id=>!known.has(id)).length;
        }
      }
    }
    const at=new Date().toISOString();
    const {error}=await db.from("bank_connections").update({
      last_synced_at:at,last_error:null,status:"connected",updated_at:at,
      last_new_transaction_count:newlyAdded,last_scanned_transaction_count:imported,
      ...(providerUpdatedAt?{provider_last_updated_at:providerUpdatedAt}:{})
    }).eq("id",connection.id).eq("owner_id",connection.owner_id);
    if(error)throw new Error("Falha ao atualizar status: "+error.code);
    return {accounts:accounts.length,transactions:imported,newTransactions:newlyAdded,providerUpdatedAt,at};
  } catch(err){
    await db.from("bank_connections").update({
      status:"attention",last_error:plainError(err),
      updated_at:new Date().toISOString(),
    }).eq("id",connection.id).eq("owner_id",connection.owner_id);
    throw err;
  }
}
export function allowPersonalItem(userId:string,clientUserId:string|null|undefined){
  return personalBankUserAllowed(userId) && (clientUserId===userId ||
    (!clientUserId && !!process.env.PLUGGY_PERSONAL_OWNER_ID &&
     process.env.PLUGGY_PERSONAL_OWNER_ID===userId));
}
export function inferBankLabel(a:PluggyAccount):string{
  return a.name || a.marketingName || "Conta";
}
