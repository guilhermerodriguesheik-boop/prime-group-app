import type { SupabaseClient } from "@supabase/supabase-js";
import { pluggyAccounts, pluggyApiKey, pluggyItem, pluggyTransactions, type PluggyAccount } from "./pluggy";

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
):Promise<{accounts:number;transactions:number;at:string}>{
  if(connection.status==="disconnected")throw new Error("Conexão desconectada.");
  const key=await pluggyApiKey();
  const item=await pluggyItem(key,connection.provider_item_id);
  if(item.id!==connection.provider_item_id)throw new Error("Conta do provedor não corresponde à conexão.");
  // Item ownership is verified on initial attach; all subsequent access is
  // restricted by Supabase RLS and the user's stored connection.
  const accounts=await pluggyAccounts(key,item.id);
  if(accounts.length>20)throw new Error("Número inesperado de contas.");
  let imported=0;
  try {
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
          direction:(t.amount! < 0 ? "debit" : "credit"),
          provider_status:safeStatus(t.status),
          category:(t.category||"").slice(0,100)||null,
          updated_at:at,
        }));
        if(batch.length){
          const {error}=await db.from("bank_transactions")
            .upsert(batch,{onConflict:"bank_account_id,provider_transaction_id"});
          if(error)throw new Error("Falha ao salvar extrato: "+error.code);
          imported+=batch.length;
        }
      }
    }
    const at=new Date().toISOString();
    const {error}=await db.from("bank_connections").update({
      last_synced_at:at,last_error:null,status:"connected",updated_at:at
    }).eq("id",connection.id).eq("owner_id",connection.owner_id);
    if(error)throw new Error("Falha ao atualizar status: "+error.code);
    return {accounts:accounts.length,transactions:imported,at};
  } catch(err){
    await db.from("bank_connections").update({
      status:"attention",last_error:plainError(err),
      updated_at:new Date().toISOString(),
    }).eq("id",connection.id).eq("owner_id",connection.owner_id);
    throw err;
  }
}
export function allowPersonalItem(userId:string,clientUserId:string|null|undefined){
  return clientUserId===userId ||
    (!clientUserId && !!process.env.PLUGGY_PERSONAL_OWNER_ID &&
     process.env.PLUGGY_PERSONAL_OWNER_ID===userId);
}
export function inferBankLabel(a:PluggyAccount):string{
  return a.name || a.marketingName || "Conta";
}
