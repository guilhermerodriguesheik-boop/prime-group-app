import "server-only";
import {randomUUID} from "node:crypto";
import {definitiveCteRejection,fiscalErrorText} from "@/lib/fiscal/cte-recovery";
import {NextResponse} from "next/server";
import {createClient as adminClient} from "@supabase/supabase-js";
import {session,gather} from "@/lib/fiscal/cte-data";
import {productionKey} from "@/lib/fiscal/cte-confirm";
import {ensureTransportPerson} from "@/lib/fiscal/dotcompany-person";
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
 // Do not preempt the provider's fiscal decision with an internal issuer gate.
 // DotCompany's response (including HTTP 4xx) will be shown to the user.
 const currentData=await gather(current.workspaceId,current.db,data.draftId);
 if(!currentData)return NextResponse.json({error:"CT-e não encontrado."},{status:404});
 const {preview}=currentData;
 if(!preview.ready)return NextResponse.json({error:"Impedimento técnico de transmissão, não avaliação fiscal.",
  missing:preview.missing},{status:409});
 if(preview.hash!==data.hash)return NextResponse.json({error:"Dados do CT-e foram alterados. Reabra a conferência antes de autorizar."},{status:409});
 // Add party IDs if known; missing fields are sent to the DotCompany for
 // an explicit validation response instead of a self-imposed fiscal veto.
 const {data:nfes,error:partsError}=await current.db.from("fiscal_nfe_inbox")
  .select("sender_cnpj,sender_name,recipient_cnpj,recipient_name")
  .eq("workspace_id",current.workspaceId).eq("cargo_reference",preview.cargoReference).limit(41);
 if(partsError)return NextResponse.json({error:"Falha de acesso às NF-e no banco; tente novamente."},{status:503});
 const first=nfes?.[0];
 let senderId:string|undefined,recipientId:string|undefined;
 if(first){
  const resolved=await Promise.allSettled([
   ensureTransportPerson(key,{cpfCnpj:first.sender_cnpj,name:first.sender_name}),
   ensureTransportPerson(key,{cpfCnpj:first.recipient_cnpj,name:first.recipient_name}),
  ]);
  const sender=resolved[0].status==="fulfilled"?resolved[0].value:null;
  const recipient=resolved[1].status==="fulfilled"?resolved[1].value:null;
  if(sender?.ok&&sender.id)senderId=sender.id;
  if(recipient?.ok&&recipient.id)recipientId=recipient.id;
 }
 const validatedPayload={...preview.payload,
  ...(senderId?{remetente_id:senderId}:{}),
  ...(recipientId?{destinatario_id:recipientId}:{}),
 };
 // Claim persistente e único ANTES da chamada à SEFAZ. Mesmo timeout de rede não permite reemissão silenciosa.
 const client=admin(),idem=randomUUID();
 let claimId:string|null=null;
 if(preview.retryAllowed){
  const {data:retryId,error:retryError}=await client.rpc("claim_corrected_cte_retry",{
   p_workspace:current.workspaceId,p_draft:data.draftId,p_user:current.userId,
   p_hash:preview.hash,p_new_key:idem,
  });
  if(!retryError&&typeof retryId==="string")claimId=retryId;
 }else{
  const {data:claim,error:claimError}=await client.from("fiscal_cte_transmissions").insert({
   workspace_id:current.workspaceId,draft_id:data.draftId,requested_by:current.userId,
   idempotency_key:idem,payload_sha256:preview.hash,status:"sending",
  }).select("id").single();
  if(!claimError&&claim)claimId=claim.id;
 }
 if(!claimId)return NextResponse.json({error:"Há transmissão anterior sem rejeição definitiva, ou outro envio já foi iniciado. Consulte o histórico antes de continuar."},{status:409});
 const update=async(status:string,fields:Record<string,unknown>)=>{
  const {error}=await client.from("fiscal_cte_transmissions")
   .update({status,...fields,updated_at:new Date().toISOString()})
   .eq("id",claimId).eq("status","sending");
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
  const message=fiscalErrorText(details);
  const code=String(received?.codigo_status_sefaz||"").slice(0,20);
  if(!response.ok){
   const definitive=definitiveCteRejection(response.status,details);
   await update(definitive?"rejected":"indeterminate",{
    error_code:"HTTP_"+response.status,
    provider_response:{message,code,http:response.status,definitive_rejection:definitive,
     provider_error:response.status===422?"VALIDATION_REJECTED":"HTTP_ERROR"}});
   return NextResponse.json({
    error:definitive?"Dados recusados antes da emissão. Corrija os campos apontados e revise antes de tentar novamente.":
      "Resultado não conclusivo; consulte a DotCompany antes de qualquer outra tentativa.",
    reason:message||null,retryAllowed:definitive,
   },{status:502});
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
   const definitive=definitiveCteRejection(response.status,details);
   await update(definitive?"rejected":"indeterminate",{
    error_code:code||"SEFAZ_REJECTED",
    provider_response:{authorized:false,message,code,definitive_rejection:definitive}});
   return NextResponse.json({authorized:false,retryAllowed:definitive,
    message:definitive?"CT-e rejeitado. Corrija os dados e revise antes de reenviar.":
      "CT-e não autorizado, mas resultado ainda exige reconciliação.",
    reason:message||null});
  }
  await update("indeterminate",{error_code:"UNCONFIRMED_RESULT",
   provider_response:{message,code}});
  return NextResponse.json({error:"O emissor não comprovou autorização. Consulte o painel DotCompany antes de qualquer nova tentativa."},{status:502});
 }catch{
  try{await update("indeterminate",{error_code:"TIMEOUT_OR_WRITE_ERROR"});}catch{}
  return NextResponse.json({error:"Resultado fiscal inconclusivo. A tentativa foi registrada e está bloqueada contra duplicação. Consulte a DotCompany."},{status:502});
 }
}
