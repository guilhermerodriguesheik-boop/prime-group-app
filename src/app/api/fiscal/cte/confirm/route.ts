import "server-only";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {createClient as adminClient} from "@supabase/supabase-js";
import {session,gather} from "@/lib/fiscal/cte-data";
import {productionKey} from "@/lib/fiscal/cte-confirm";
export const runtime="nodejs";
export const maxDuration=60;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function admin(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!secret)throw Error("SUPABASE_ADMIN_MISSING");
 return adminClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
}
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)return NextResponse.json({error:"Origem inválida."},{status:403});
 if(req.headers.get("x-prime-action")!=="fiscal-cte-confirm")
  return NextResponse.json({error:"Confirmação inválida."},{status:403});
 const data=await req.json().catch(()=>null) as {draftId?:unknown;hash?:unknown;confirmation?:unknown}|null;
 if(!data||typeof data.draftId!=="string"||!uuid.test(data.draftId)||
    typeof data.hash!=="string"||!/^[a-f0-9]{64}$/.test(data.hash)||
    data.confirmation!=="CONFIRMO O ENVIO À SEFAZ")
  return NextResponse.json({error:"É necessária confirmação expressa e revisão atualizada."},{status:400});
 const current=await session();
 if(!current)return NextResponse.json({error:"Entre na conta proprietária Prime."},{status:401});
 const key=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
 if(!productionKey(key)||process.env.DOTCOMPANY_CTE_LIVE_ENABLED!=="true")
  return NextResponse.json({error:"Emissão real não habilitada. Configure chave de produção e valide o emissor antes de transmitir."},{status:409});
 const currentData=await gather(current.workspaceId,current.db,data.draftId);
 if(!currentData)return NextResponse.json({error:"CT-e não encontrado."},{status:404});
 const {preview}=currentData;
 if(!preview.ready)return NextResponse.json({error:"CT-e possui pendências de validação. Nenhum documento foi enviado.",
  missing:preview.missing},{status:409});
 if(preview.hash!==data.hash)return NextResponse.json({error:"Dados do CT-e foram alterados. Reabra a conferência antes de autorizar."},{status:409});
 // Claim persistente e único ANTES da chamada à SEFAZ. Mesmo timeout de rede não permite reemissão silenciosa.
 const client=admin(),idem=randomUUID();
 const {data:claim,error:claimError}=await client.from("fiscal_cte_transmissions").insert({
  workspace_id:current.workspaceId,draft_id:data.draftId,requested_by:current.userId,
  idempotency_key:idem,payload_sha256:preview.hash,status:"sending",
 }).select("id").single();
 if(claimError||!claim)return NextResponse.json({error:"Já existe transmissão ou tentativa para este CT-e. Confira o resultado no painel antes de qualquer nova emissão."},{status:409});
 const update=async(status:string,fields:Record<string,unknown>)=>{
  const {error}=await client.from("fiscal_cte_transmissions")
   .update({status,...fields,updated_at:new Date().toISOString()})
   .eq("id",claim.id).eq("status","sending");
  if(error)throw Error("FISCAL_RESULT_SAVE_FAILED");
 };
 try{
  const response=await fetch("https://erp.dotcompany.com.br/api/v1/cte/criar-e-emitir",{
   method:"POST",
   headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json",
    "Accept":"application/json","Idempotency-Key":idem},
   body:JSON.stringify({...preview.payload,idempotency_key:idem}),
   cache:"no-store",signal:AbortSignal.timeout(24000),
  });
  const received=await response.json().catch(()=>null) as
    {autorizado?:unknown;chave_acesso?:unknown;protocolo?:unknown;message?:unknown;codigo_status_sefaz?:unknown}|null;
  const message=typeof received?.message==="string"?received.message.slice(0,450):"";
  const code=String(received?.codigo_status_sefaz||"").slice(0,20);
  if(!response.ok){
   await update("indeterminate",{error_code:"HTTP_"+response.status,
    provider_response:{message,code,http:response.status}});
   return NextResponse.json({error:"O emissor retornou erro sem confirmação de resultado. Consulte a DotCompany antes de tentar novamente."},{status:502});
  }
  const authorized=received?.autorizado===true;
  const access=String(received?.chave_acesso||"");
  const protocol=String(received?.protocolo||"");
  if(authorized&&/^\d{44}$/.test(access)&&protocol.length>5){
   await update("authorized",{access_key:access,protocol,
    provider_response:{authorized:true,message,code}});
   return NextResponse.json({authorized:true,key:access,protocol,
    message:"CT-e autorizado segundo o retorno da DotCompany. Confira a chave e o protocolo."});
  }
  if(received?.autorizado===false){
   await update("rejected",{error_code:code||"SEFAZ_REJECTED",
    provider_response:{authorized:false,message,code}});
   return NextResponse.json({authorized:false,message:"SEFAZ não autorizou o CT-e: "+
    (message||"verifique a rejeição no emissor. Nenhum CT-e válido foi confirmado.")});
  }
  await update("indeterminate",{error_code:"UNCONFIRMED_RESULT",
   provider_response:{message,code}});
  return NextResponse.json({error:"O emissor não comprovou autorização. Consulte o painel DotCompany antes de qualquer nova tentativa."},{status:502});
 }catch{
  try{await update("indeterminate",{error_code:"TIMEOUT_OR_WRITE_ERROR"});}catch{}
  return NextResponse.json({error:"Resultado fiscal inconclusivo. A tentativa foi registrada e está bloqueada contra duplicação. Consulte a DotCompany."},{status:502});
 }
}
