/**
 * One-time operator-authorized CT-e emission (cargo 030151 only).
 * Requires separately created DotCompany draft and read-only remote reconciliation.
 * Any ambiguity preserves history and NEVER triggers a second fiscal POST.
 */
const cargo="030151",workspace="02d2e803-11ab-46e4-b546-86040961bbf4";
const key=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:secret,Authorization:"Bearer "+secret,"Content-Type":"application/json",Accept:"application/json"};
const log=x=>console.log("CTE_TWO_STAGE_EMIT: "+x);
const enc=encodeURIComponent;
async function db(table,query="",method="GET",body,prefer){
 const r=await fetch(url+"/rest/v1/"+table+(query?"?"+query:""),{
  method,headers:{...headers,...(prefer?{Prefer:prefer}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(17000),cache:"no-store",
 });
 const raw=await r.text();
 if(!r.ok)throw Error("DATABASE_HTTP_"+r.status);
 try{return JSON.parse(raw)}catch{return null}
}
const one=async(table,filters,columns)=>(
 (await db(table,filters+"&select="+enc(columns)+"&limit=1"))||[])[0]||null;
const safe=x=>String(x??"").slice(0,500);
const val=x=>Number.isFinite(Number(x))?Number(x):0;
async function main(){
 if(process.env.VERCEL_ENV!=="production")return log("skipped outside production");
 if(!key||!/^dc_live_[A-Za-z0-9._-]{16,}$/.test(key)||!url||!secret)
  return log("skipped missing production configuration");
 const op=await one("fiscal_cte_two_stage_operations",
  "workspace_id=eq."+workspace+"&cargo_reference=eq."+cargo+"&stage=eq.emit&status=eq.queued",
  "id,draft_id,idempotency_key");
 if(!op)return log("nothing queued");
 const claim=await db("fiscal_cte_two_stage_operations","id=eq."+op.id+"&status=eq.queued",
  "PATCH",{status:"running",updated_at:new Date().toISOString()},"return=representation");
 if(!Array.isArray(claim)||claim.length!==1)return log("already claimed");
 const finish=async(status,summary,providerId=null)=>
  db("fiscal_cte_two_stage_operations","id=eq."+op.id+"&status=eq.running","PATCH",
   {status,response_summary:summary,provider_cte_id:providerId,updated_at:new Date().toISOString()},"return=minimal");
 let emissionStarted=false,providerId=null;
 try{
  const prep=await one("fiscal_cte_two_stage_operations",
   "draft_id=eq."+op.draft_id+"&stage=eq.create&status=eq.prepared",
   "provider_cte_id,response_summary");
  if(!prep||!Number.isSafeInteger(Number(prep.provider_cte_id))||Number(prep.provider_cte_id)<=0)
    throw Error("PREPARED_DRAFT_ID_MISSING");
  providerId=Number(prep.provider_cte_id);
  const tr=await one("fiscal_cte_transmissions",
   "draft_id=eq."+op.draft_id+"&workspace_id=eq."+workspace,
   "id,status,error_code,access_key,protocol,provider_response");
  const previous=String(tr?.provider_response?.message||"");
  if(!tr||tr.status!=="indeterminate"||tr.error_code!=="DOTCOMPANY_CERTIFICATE_SERVICE_FAILURE"||
     tr.access_key||tr.protocol||!previous.includes("CertificadoService.__init__()"))
    throw Error("PRIOR_FISCAL_STATUS_CHANGED");
  // Listing is free and read-only; parse the actual OpenAPI field 'itens'.
  const check=await fetch("https://erp.dotcompany.com.br/api/v1/cte/listar",{
   method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json"},
   body:JSON.stringify({emitter_id:646,limite:200,offset:0}),
   signal:AbortSignal.timeout(16000),cache:"no-store"
  });
  const list=await check.json().catch(()=>null);
  if(!check.ok||!list||!Array.isArray(list.itens))throw Error("PROVIDER_LIST_UNVERIFIED");
  if(list.itens.length===200)throw Error("LIST_PAGINATION_REQUIRED");
  const target=list.itens.filter(x=>Number(x.cte_id)===providerId);
  if(target.length!==1||String(target[0].status||"").toLowerCase()!=="rascunho")
   throw Error("REMOTE_DRAFT_NOT_CONFIRMED");
  // The earlier attempt returned a Python certificate constructor exception, no
  // authorization, no key, no protocol. If another comparable authorized/pending
  // transport appears, require manual reconciliation instead of duplicating it.
  const conflicts=list.itens.filter(x=>Number(x.cte_id)!==providerId&&
   ["autorizado","pendente"].includes(String(x.status||"").toLowerCase())&&
   x.uf_inicio==="RJ"&&x.uf_fim==="RJ"&&Math.abs(val(x.valor_total_servico)-1800)<0.01);
  if(conflicts.length)throw Error("POSSIBLE_EXISTING_AUTHORIZED_OR_PENDING_CTE");
  log("draft id="+providerId+" confirmed; issuing once as authorized by owner");
  emissionStarted=true;
  let r,body;
  try{
   r=await fetch("https://erp.dotcompany.com.br/api/v1/cte/emitir",{
    method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json",
     Accept:"application/json","Idempotency-Key":op.idempotency_key},
    body:JSON.stringify({cte_id:providerId,emitter_id:646,idempotency_key:op.idempotency_key}),
    signal:AbortSignal.timeout(26000),cache:"no-store"
   });
   body=await r.json().catch(()=>null);
  }catch{
   await finish("unknown",{operation:"cte.emitir",reason:"NETWORK_UNCONFIRMED"},String(providerId));
   return log("network result inconclusive; no retry");
  }
  const v=body&&typeof body==="object"&&!Array.isArray(body)?body:{};
  const authorized=v.autorizado===true;
  const access=String(v.chave_acesso||"");
  const protocol=String(v.protocolo||"");
  const summary={operation:"cte.emitir",provider_cte_id:providerId,http:r.status,
   returnedAuthorized:authorized,hasAccessKey:/^\d{44}$/.test(access),hasProtocol:!!protocol,
   code:safe(v.codigo_status_sefaz??v.code??v.codigo??""),
   message:safe(v.message??v.mensagem??v.detail??v.erro?.titulo),
   providerFields:Object.keys(v).slice(0,25)};
  if(r.ok&&authorized&&/^\d{44}$/.test(access)&&protocol.length>5){
   await finish("authorized",summary,String(providerId));
   // Preserve first-attempt diagnostics in the nested previous_response.
   const updated=await db("fiscal_cte_transmissions",
    "id=eq."+tr.id+"&workspace_id=eq."+workspace+"&status=eq.indeterminate",
    "PATCH",{status:"authorized",access_key:access,protocol,error_code:null,
     provider_response:{authorized:true,cte_id:providerId,
      source:"authorized_two_step_cte_emitir",previous_response:tr.provider_response,
      message:"CT-e autorizado pela DotCompany na emissão separada."},
     updated_at:new Date().toISOString()},"return=representation");
   if(!Array.isArray(updated)||updated.length!==1)log("authorized but local transmission synchronization requires review");
   else log("AUTHORIZED AND SYNCED id="+providerId);
  }else{
   const definitive=!!v.codigo_status_sefaz&&v.autorizado===false;
   await finish(definitive?"rejected":"unknown",summary,String(providerId));
   log("not authorized; http="+r.status+" outcome="+(definitive?"rejected":"unknown")+"; no retry");
  }
 }catch(e){
  const reason=String(e?.message||"UNKNOWN").replace(/[^A-Z0-9_]/g,"").slice(0,95);
  try{await finish(emissionStarted?"unknown":"paused",{reason,provider_cte_id:providerId},providerId==null?null:String(providerId));}catch{}
  log("stopped "+reason+(emissionStarted?" after emission attempt":" before transmission"));
 }
}
await main().catch(()=>log("unhandled operation error"));
