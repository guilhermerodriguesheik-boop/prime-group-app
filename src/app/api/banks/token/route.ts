import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pluggyApiKey, pluggyConnectToken, pluggyReady } from "@/lib/banks/pluggy";

export const runtime="nodejs";
export async function POST(request:Request) {
  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(request.url).origin)
    return NextResponse.json({error:"Origem inválida."},{status:403});
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Faça login."},{status:401});
  if(!pluggyReady())return NextResponse.json({
    error:"Credenciais Pluggy ainda não configuradas na Vercel."
  },{status:503});
  let workspaceId:string;
  try{
    const body=await request.json();
    workspaceId=body.workspaceId;
  }catch{return NextResponse.json({error:"Pedido inválido."},{status:400});}
  if(typeof workspaceId!=="string")
    return NextResponse.json({error:"Ambiente obrigatório."},{status:400});
  const {data:workspace}=await supabase.from("workspaces")
    .select("id").eq("id",workspaceId).eq("owner_id",user.id).maybeSingle();
  if(!workspace)return NextResponse.json({error:"Ambiente não autorizado."},{status:403});
  try{
    const key=await pluggyApiKey();
    const accessToken=await pluggyConnectToken(key,user.id);
    return NextResponse.json({accessToken},{
      headers:{"Cache-Control":"no-store","Pragma":"no-cache"}
    });
  }catch(e){
    return NextResponse.json({
      error:e instanceof Error?e.message:"Falha ao iniciar conexão."
    },{status:502});
  }
}
