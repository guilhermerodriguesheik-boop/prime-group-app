import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { pluggyAccounts, pluggyApiKey, pluggyItem, pluggyReady } from "@/lib/banks/pluggy";
import { allowPersonalItem, syncBankConnection } from "@/lib/banks/sync";
import {queueBankReviewDigests,runPrimeOutbox} from "@/lib/whatsapp/prime-automations";

export const runtime="nodejs";
export const maxDuration=60;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const banks={
  itau:{name:"Itaú Empresas",kind:"business",workspace:"prime"},
  bradesco:{name:"Bradesco Empresas",kind:"business",workspace:"prime"},
  inter:{name:"Inter Pessoal",kind:"personal",workspace:"personal"},
} as const;
type BankSlug=keyof typeof banks;
const fresh=()=>new Date().toISOString();
function json(data:unknown,status=200){return NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});}
async function current() {
  const client=await createClient();
  const {data:{user},error}=await client.auth.getUser();
  return {user:error?null:user,db:client as unknown as SupabaseClient};
}
function sameOrigin(req:Request) {
  const origin=req.headers.get("origin");
  return !origin || origin===new URL(req.url).origin;
}
function identifyBank(accounts:{name?:string;marketingName?:string}[]):BankSlug|null {
  const recognized=new Set<BankSlug>();
  for(const account of accounts){
    const name=(account.name||"")+" "+(account.marketingName||"");
    if(/ita[uú]|itaubba/i.test(name))recognized.add("itau");
    if(/bradesco/i.test(name))recognized.add("bradesco");
    if(/\binter\b/i.test(name))recognized.add("inter");
  }
  return recognized.size===1?[...recognized][0]:null;
}
async function authorizedItem(itemId:string,userId:string){
  const key=await pluggyApiKey();
  const item=await pluggyItem(key,itemId);
  if(item.id!==itemId || !allowPersonalItem(userId,item.clientUserId))
    throw new Error("Esta conta não pertence ao usuário autorizado.");
  const accounts=await pluggyAccounts(key,itemId);
  if(!accounts.length || accounts.length>20)throw new Error("Não foi possível identificar as contas desse item.");
  return {item,accounts,detected:identifyBank(accounts)};
}
export async function GET(request:Request){
  const {user,db}=await current();
  if(!user)return json({error:"Faça login."},401);
  const archivedView=new URL(request.url).searchParams.get("archived")==="1";
  const [workspaces,connections,accounts]=await Promise.all([
    db.from("workspaces").select("id,name,kind").eq("owner_id",user.id),
    db.from("bank_connections").select("id,provider,workspace_id,display_name,institution_name,account_kind,status,last_synced_at,provider_last_updated_at,last_new_transaction_count,last_scanned_transaction_count,webhook_check_at,webhook_check_status,webhook_check_error,last_error,created_at,archived_at").eq("owner_id",user.id).order("created_at",{ascending:false}),
    db.from("bank_accounts").select("id,workspace_id,connection_id,display_name,account_last4,kind,currency,balance,balance_updated_at").eq("owner_id",user.id),
  ]);
  const err=[workspaces.error,connections.error,accounts.error].find(Boolean);
  if(err)return json({error:"Não foi possível consultar dados bancários."},500);
  const selected=new Set((connections.data||[]).filter(c=>Boolean(c.archived_at)===archivedView).map(c=>c.id));
  const accountIds=(accounts.data||[]).filter(a=>selected.has(a.connection_id)).map(a=>a.id);
  const movements=accountIds.length
    ? await db.from("bank_transactions").select("id,workspace_id,bank_account_id,occurred_on,description,amount,direction,provider_status,review_status,category").eq("owner_id",user.id).in("bank_account_id",accountIds).order("occurred_on",{ascending:false}).limit(150)
    : {data:[],error:null};
  if(movements.error)return json({error:"Não foi possível consultar extratos bancários."},500);
  const txIds=(movements.data||[]).map(t=>t.id);
  const classifications=txIds.length
    ? await db.from("prime_bank_classifications").select("bank_transaction_id,destination,category")
      .eq("user_id",user.id).in("bank_transaction_id",txIds)
    : {data:[],error:null};
  if(classifications.error)return json({error:"Falha ao carregar classificações."},500);
  return json({
    configured:pluggyReady(),workspaces:workspaces.data||[],
    connections:connections.data||[],accounts:accounts.data||[],transactions:movements.data||[],classifications:classifications.data||[],
    archivedView,
    mode:process.env.PLUGGY_PERSONAL_OWNER_ID===user.id?"personal-allowed":"standard",
  });
}
export async function POST(request:Request){
  const {user,db}=await current();
  if(!user)return json({error:"Faça login."},401);
  if(!sameOrigin(request))return json({error:"Origem não autorizada."},403);
  if(Number(request.headers.get("content-length")||0)>4096)return json({error:"Requisição grande demais."},413);
  let body:Record<string,unknown>;
  try{body=await request.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error();}
  catch{return json({error:"Pedido inválido."},400);}
  const action=body.action;
  if(action==="preview" || action==="attach"){
    const itemId=body.itemId;
    const bank=body.bank;
    if(typeof itemId!=="string"||!uuid.test(itemId)||
       typeof bank!=="string"||!(bank in banks))
      return json({error:"Selecione um banco e um item válido."},400);
    if(!pluggyReady())return json({error:"Credenciais Pluggy indisponíveis."},503);
    const spec=banks[bank as BankSlug];
    try{
      const {accounts,detected}=await authorizedItem(itemId,user.id);
      const summary=accounts.map(a=>({
        name:(a.marketingName||a.name||"Conta").slice(0,90),
        last4:(a.number||"").replace(/\D/g,"").slice(-4),
        type:a.type,
      }));
      if(action==="preview")return json({accounts:summary,detected,selected:bank,mismatch:!!detected&&detected!==bank});
      if(detected && detected!==bank)
        return json({error:"Banco diferente do escolhido. Identificamos "+banks[detected].name+". Selecione o banco correto antes de vincular."},409);
      if(body.confirmed!==true)return json({error:"Confirme o banco, ambiente e titularidade antes de vincular."},400);
      const workspaceId=body.workspaceId;
      if(typeof workspaceId!=="string"||!uuid.test(workspaceId))
        return json({error:"Ambiente inválido."},400);
      const {data:w,error:workErr}=await db.from("workspaces").select("id,kind")
        .eq("id",workspaceId).eq("owner_id",user.id).single();
      if(workErr||!w||w.kind!==spec.workspace)
        return json({error:"O banco não corresponde ao ambiente escolhido."},403);
      const {data:previous}=await db.from("bank_connections").select("id").eq("provider_item_id",itemId).eq("owner_id",user.id).maybeSingle();
      if(previous)return json({error:"Esta conexão já foi cadastrada. Remova ou arquive a anterior antes de reconectar."},409);
      const {data:created,error}=await db.from("bank_connections").insert({
        owner_id:user.id,workspace_id:workspaceId,provider_item_id:itemId,
        display_name:spec.name,account_kind:spec.kind,
        institution_name:spec.name,status:"connected",
      }).select("id").single();
      if(error||!created)return json({error:"Não foi possível cadastrar essa conexão. Verifique se já existe."},409);
      return json({connected:true,id:created.id},201);
    }catch(e){return json({error:e instanceof Error?e.message:"Erro ao acessar conta."},502);}
  }
  if(action==="sync"||action==="pause"||action==="resume"||action==="archive"||action==="remove"){
    const id=body.id;
    if(typeof id!=="string"||!uuid.test(id))return json({error:"Conexão inválida."},400);
    const {data:c,error:lookupError}=await db.from("bank_connections")
      .select("id,owner_id,provider,workspace_id,provider_item_id,status,display_name,last_synced_at,archived_at")
      .eq("id",id).eq("owner_id",user.id).maybeSingle();
    if(lookupError)return json({error:"Falha ao verificar a conexão."},500);
    if(!c)return json({error:"Conexão não encontrada."},404);
    if(action==="remove" || action==="archive"){
      if(body.confirmation!==c.display_name)return json({error:"Confirme o nome exato da conexão antes de remover."},400);
      if(action==="archive"){
        if(c.archived_at)return json({error:"Conexão já foi arquivada."},409);
        const {error}=await db.from("bank_connections").update({
          archived_at:fresh(),provider_item_id:"archived:"+c.id,
          status:"disconnected",last_error:null,updated_at:fresh(),
        }).eq("id",c.id).eq("owner_id",user.id).is("archived_at",null);
        return error?json({error:"Não foi possível desvincular."},500):json({ok:true,mode:"archived"});
      }
      // Never remove already reconciled transactions without explicit accounting repair.
      const {data:accounts,error:accountsError}=await db.from("bank_accounts")
        .select("id").eq("connection_id",c.id).eq("owner_id",user.id);
      if(accountsError)return json({error:"Não foi possível conferir vínculos financeiros."},500);
      if(accounts?.length){
        const {data:linked,error:linkedError}=await db.from("bank_transactions").select("id")
          .eq("owner_id",user.id).in("bank_account_id",accounts.map(a=>a.id))
          .or("review_status.eq.matched,linked_transaction_id.not.is.null").limit(1);
        if(linkedError)return json({error:"Não foi possível conferir a conciliação."},500);
        if(linked?.length)return json({error:"Há transações conciliadas. Desfaça a conciliação antes de excluir os extratos."},409);
      }
      const {data:deleted,error}=await db.from("bank_connections").delete()
        .eq("id",c.id).eq("owner_id",user.id).select("id").maybeSingle();
      if(error||!deleted)return json({error:"Não foi possível excluir a conexão e os extratos."},500);
      return json({ok:true,mode:"deleted"});
    }
    if(c.archived_at)return json({error:"Esta conexão está arquivada. Autorize uma nova conexão para atualizar."},409);
    if(action==="pause"||action==="resume"){
      const status=action==="pause"?"disconnected":"connected";
      const {error}=await db.from("bank_connections").update({status,updated_at:fresh()})
        .eq("id",c.id).eq("owner_id",user.id);
      return error?json({error:"Falha ao atualizar."},500):json({ok:true,status});
    }
    if(c.status==="disconnected")return json({error:"Conexão pausada. Reative-a para sincronizar."},409);
    if(c.provider==="manual")return json({error:"Conta OFX: importe outro extrato para atualizar."},400);
    if(!pluggyReady())return json({error:"Pluggy não configurada."},503);
    if(c.last_synced_at && Date.now()-Date.parse(c.last_synced_at)<10*60_000 && body.force!==true)
      return json({ok:true,cached:true});
    try{
      const result=await syncBankConnection(db,c,120);
      if(result.newTransactions>0){
        try{
          const queued=await queueBankReviewDigests();
          if(queued>0)await runPrimeOutbox(3);
        }catch(error){console.error("Bank review delivery deferred",error instanceof Error?error.message:"unknown");}
      }
      return json({ok:true,...result});
    }
    catch(e){return json({error:e instanceof Error?e.message:"Falha de sincronização."},502);}
  }
  if(action==="review"){
    const id=body.id,status=body.status;
    if(typeof id!=="string"||!uuid.test(id)||!["ignored","pending"].includes(String(status)))
      return json({error:"Revisão inválida."},400);
    const {error}=await db.from("bank_transactions").update({review_status:status,updated_at:fresh()})
      .eq("id",id).eq("owner_id",user.id);
    return error?json({error:"Não foi possível revisar."},500):json({ok:true});
  }
  return json({error:"Ação não reconhecida."},400);
}
