import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { pluggyApiKey, pluggyItem, pluggyReady } from "@/lib/banks/pluggy";
import { allowPersonalItem, syncBankConnection } from "@/lib/banks/sync";

export const runtime="nodejs";
export const maxDuration=60;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fresh=()=>new Date().toISOString();
function json(data:unknown,status=200){return NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});}
async function current() {
  const client=await createClient();
  const {data:{user},error}=await client.auth.getUser();
  return {user:error?null:user,db:client as unknown as SupabaseClient};
}
function sameOrigin(req:Request) {
  const origin=req.headers.get("origin");
  if(!origin)return true;
  return origin===new URL(req.url).origin;
}
export async function GET(){
  const {user,db}=await current();
  if(!user)return json({error:"Faça login."},401);
  const [workspaces,connections,accounts,transactions]=await Promise.all([
    db.from("workspaces").select("id,name,kind").eq("owner_id",user.id),
    db.from("bank_connections").select("id,workspace_id,display_name,institution_name,account_kind,status,last_synced_at,last_error,created_at").eq("owner_id",user.id).order("created_at",{ascending:false}),
    db.from("bank_accounts").select("id,workspace_id,connection_id,display_name,account_last4,kind,currency,balance,balance_updated_at").eq("owner_id",user.id),
    db.from("bank_transactions").select("id,workspace_id,bank_account_id,occurred_on,description,amount,direction,provider_status,review_status,category").eq("owner_id",user.id).order("occurred_on",{ascending:false}).limit(150),
  ]);
  const err=[workspaces.error,connections.error,accounts.error,transactions.error].find(Boolean);
  if(err)return json({error:"Não foi possível consultar os dados bancários."},500);
  return json({
    configured:pluggyReady(),workspaces:workspaces.data||[],
    connections:connections.data||[],accounts:accounts.data||[],transactions:transactions.data||[],
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
  if(action==="attach"){
    const itemId=body.itemId;
    const workspaceId=body.workspaceId;
    const kind=body.kind;
    const label=body.label;
    if(typeof itemId!=="string"||!uuid.test(itemId)||
       typeof workspaceId!=="string"||!uuid.test(workspaceId)||
       !["business","personal"].includes(String(kind))||
       typeof label!=="string"||label.length>80||label.length<3)
      return json({error:"Dados da conexão inválidos."},400);
    if(!pluggyReady())return json({error:"Configure suas credenciais Pluggy primeiro."},503);
    const {data:w}=await db.from("workspaces").select("id,kind").eq("id",workspaceId).eq("owner_id",user.id).single();
    if(!w||w.kind!==(kind==="business"?"prime":"personal"))
      return json({error:"Escolha o ambiente correspondente à titularidade da conta."},403);
    try{
      const key=await pluggyApiKey();
      const item=await pluggyItem(key,itemId);
      if(item.id!==itemId || !allowPersonalItem(user.id,item.clientUserId))
        return json({error:"Item bancário não autorizado para este usuário."},403);
      const {data:previous}=await db.from("bank_connections").select("id").eq("provider_item_id",itemId).eq("owner_id",user.id).maybeSingle();
      if(previous)return json({error:"Esta conexão já está cadastrada."},409);
      const {data:created,error}=await db.from("bank_connections").insert({
        owner_id:user.id,workspace_id:workspaceId,provider_item_id:itemId,
        display_name:label,account_kind:kind,
        institution_name:item.connector?.name||label,status:"connected",
      }).select("id").single();
      if(error||!created)return json({error:"Falha ao vincular conta. Verifique se já foi cadastrada."},409);
      // Defer heavy sync to a distinct authenticated POST so errors remain visible.
      return json({connected:true,id:created.id},201);
    }catch(e){
      return json({error:e instanceof Error?e.message:"Erro ao vincular."},502);
    }
  }
  if(action==="sync"||action==="pause"||action==="resume"){
    const id=body.id;
    if(typeof id!=="string"||!uuid.test(id))return json({error:"Conexão inválida."},400);
    const {data:c}=await db.from("bank_connections")
      .select("id,owner_id,workspace_id,provider_item_id,status,display_name,last_synced_at")
      .eq("id",id).eq("owner_id",user.id).maybeSingle();
    if(!c)return json({error:"Conexão não encontrada."},404);
    if(action==="pause"||action==="resume"){
      const status=action==="pause"?"disconnected":"connected";
      const {error}=await db.from("bank_connections").update({status,updated_at:fresh()})
        .eq("id",c.id).eq("owner_id",user.id);
      return error?json({error:"Falha ao atualizar."},500):json({ok:true,status});
    }
    if(!pluggyReady())return json({error:"Pluggy não configurada."},503);
    if(c.last_synced_at && Date.now()-Date.parse(c.last_synced_at)<10*60_000 && body.force!==true)
      return json({ok:true,cached:true});
    try{
      const result=await syncBankConnection(db,c,120);
      return json({ok:true,...result});
    }catch(e){return json({error:e instanceof Error?e.message:"Falha de sincronização."},502);}
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
