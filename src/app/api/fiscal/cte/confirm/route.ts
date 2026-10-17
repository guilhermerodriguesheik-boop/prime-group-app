import "server-only";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {createClient as adminClient} from "@supabase/supabase-js";
import {session,gather} from "@/lib/fiscal/cte-data";
import {productionKey} from "@/lib/fiscal/cte-confirm";
import {ensureTransportPerson} from "@/lib/fiscal/dotcompany-person";
import {checkDotCompanyProduction,checkPrimeEmitterReadiness} from "@/lib/fiscal/dotcompany-production";
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
 // Read-only, fail-closed check against DotCompany before claiming a fiscal transmission.
 // A configured dc_live_ token is NOT proof that the provider has authorized it.
 const verified=await checkDotCompanyProduction(key,true);
 if(!verified.authenticated){
  return NextResponse.json({
   error:"Chave DotCompany de produção não autenticada. Nenhum CT-e foi enviado.",
   reason:verified.reason||"A API fiscal não confirmou as credenciais.",
   httpStatus:verified.status||null,
  },{status:503,headers:{"Cache-Control":"no-store"}});
 }
 // Reject an unavailable emitter BEFORE persisting an idempotency claim.
 // This prevents 422 + unusable indeterminate records caused by incomplete CT-e setup.
 const issuer=await checkPrimeEmitterReadiness(key);
 if(!issuer.verified||!issuer.cteReady){
  return NextResponse.json({
   error:"O emissor CT-e da DotCompany não está habilitado para produção.",
   reason:issuer.reason,
   details:{rntrcConfigured:issuer.hasRntrc,
    cteTaxProfileConfigured:issuer.hasCteIcMSConfig,
    series3Configured:issuer.numberingCteConfigured},
   noFiscalTransmission:true,
  },{status:409,headers:{"Cache-Control":"no-store"}});
 }
 if(!issuer.numberingCteConfigured)return NextResponse.json({error:"Série CT-e 003 ainda não confirmada no perfil DotCompany; envio suspenso."},{status:409});
 const currentData=await gather(current.workspaceId,current.db,data.draftId);
 if(!currentData)return NextResponse.json({error:"CT-e não encontrado."},{status:404});
 const {preview}=currentData;
 if(!preview.ready)return NextResponse.json({error:"CT-e possui pendências de validação. Nenhum documento foi enviado.",
  missing:preview.missing},{status:409});
 if(preview.hash!==data.hash)return NextResponse.json({error:"Dados do CT-e foram alterados. Reabra a conferência antes de autorizar."},{status:409});
 const {data:nfes,error:partsError}=await current.db.from("fiscal_nfe_inbox")
  .select("sender_cnpj,sender_name,recipient_cnpj,recipient_name")
  .eq("workspace_id",current.workspaceId).eq("cargo_reference",preview.cargoReference).limit(41);
 if(partsError||!nfes||nfes.length!==preview.invoiceCount||
  nfes.some(n=>n.sender_cnpj!==nfes[0].sender_cnpj||n.recipient_cnpj!==nfes[0].recipient_cnpj))
  return NextResponse.json({error:"Remetente/destinatário divergente entre NF-e. Nenhum CT-e foi enviado."},{status:409});
 const sender=await ensureTransportPerson(key,{cpfCnpj:nfes[0].sender_cnpj,name:nfes[0].sender_name});
 const recipient=await ensureTransportPerson(key,{cpfCnpj:nfes[0].recipient_cnpj,name:nfes[0].recipient_name});
 if(!sender.ok||!recipient.ok||!sender.id||!recipient.id)
  return NextResponse.json({error:"Cadastro de pessoas da DotCompany não concluído. Nenhum CT-e foi enviado.",
   remetente:sender.reason,destinatario:recipient.reason},{status:409});
 const validatedPayload={...preview.payload,remetente_id:sender.id,destinatario_id:recipient.id};
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
   body:JSON.stringify({...validatedPayload,idempotency_key:idem}),
   cache:"no-store",signal:AbortSignal.timeout(24000),
  });
  const received=await response.json().catch(()=>null) as
    {autorizado?:unknown;chave_acesso?:unknown;protocolo?:unknown;message?:unknown;codigo_status_sefaz?:unknown}|null;
  const details=received&&typeof received==="object"?received as Record<string,unknown>:{};
  const detailText=[details.message,details.error,details.erro,details.detail,details.mensagem,details.mensagem_original]
   .map(v=>typeof v==="string"?v:(v&&typeof v==="object"?JSON.stringify(v):""))
   .filter(Boolean).join(" | ").slice(0,1000);
  const message=detailText.replace(/dc_(?:live|test)_[A-Za-z0-9._-]+/g,"[TOKEN_REDACTED]");
  const code=String(received?.codigo_status_sefaz||"").slice(0,20);
  if(!response.ok){
   await update("indeterminate",{error_code:"HTTP_"+response.status,
    provider_response:{message,code,http:response.status,provider_error:response.status===422?"VALIDATION_REJECTED":"HTTP_ERROR"}});
   return NextResponse.json({error:response.status===422?"DotCompany recusou os dados do CT-e (HTTP 422). Nenhum documento foi confirmado. Consulte o diagnóstico da tentativa antes de corrigir ou reenviar.":"O emissor retornou erro sem confirmação de resultado. Consulte a DotCompany antes de tentar novamente.",reason:message||null},{status:502});
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
