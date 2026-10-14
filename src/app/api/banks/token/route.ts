import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { meuPluggyConnector, personalBankUserAllowed, pluggyApiKey, pluggyConnectToken, pluggyReady } from "@/lib/banks/pluggy";

export const runtime="nodejs";
export async function POST(request:Request) {
  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(request.url).origin)
    return NextResponse.json({error:"Origem inválida."},{status:403});
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Faça login."},{status:401});
  if(!personalBankUserAllowed(user.id))return NextResponse.json({error:"Integração reservada ao titular."},{status:403});
  if(!pluggyReady())return NextResponse.json({
    error:"Credenciais Pluggy ainda não configuradas na Vercel."
  },{status:503});
  let workspaceId:string;
  let connectionId:string|undefined;
  try{
    const body=await request.json();
    workspaceId=body.workspaceId;
    connectionId=body.connectionId;
  }catch{return NextResponse.json({error:"Pedido inválido."},{status:400});}
  if(typeof workspaceId!=="string")
    return NextResponse.json({error:"Ambiente obrigatório."},{status:400});
  const {data:workspace}=await supabase.from("workspaces")
    .select("id").eq("id",workspaceId).eq("owner_id",user.id).maybeSingle();
  if(!workspace)return NextResponse.json({error:"Ambiente não autorizado."},{status:403});
  let updateItem:string|undefined;
  if(connectionId!==undefined){
    if(!/^[0-9a-f-]{36}$/i.test(connectionId))
      return NextResponse.json({error:"Conexão inválida."},{status:400});
    const {data:connection,error}=await supabase.from("bank_connections")
      .select("provider_item_id,status,archived_at")
      .eq("id",connectionId).eq("owner_id",user.id)
      .eq("workspace_id",workspaceId).eq("provider","pluggy").maybeSingle();
    if(error||!connection||connection.archived_at||connection.status==="disconnected")
      return NextResponse.json({error:"Conexão indisponível para atualização."},{status:403});
    updateItem=connection.provider_item_id;
    if(!/^[0-9a-f-]{36}$/i.test(updateItem))
      return NextResponse.json({error:"Item inválido na Pluggy."},{status:400});
  }
  try{
    const key=await pluggyApiKey();
    const connectorId=!updateItem && process.env.PLUGGY_PERSONAL_OWNER_ID ? await meuPluggyConnector(key) : null;
    const accessToken=await pluggyConnectToken(key,user.id,updateItem);
    return NextResponse.json({accessToken,connectorId,updateItem:updateItem||null},{
      headers:{"Cache-Control":"no-store","Pragma":"no-cache"}
    });
  }catch(e){
    return NextResponse.json({
      error:e instanceof Error?e.message:"Falha ao iniciar conexão."
    },{status:502});
  }
}
