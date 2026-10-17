/**
 * Cargo 030151: single authorized attempt via DotCompany's independent /fiscal/cte API.
 * Invoked ONLY if the durable stage is queued. Never loops or blindly retries.
 * Consults the existing CT-e 63 and all remote issuance records before acting.
 */
const workspace="02d2e803-11ab-46e4-b546-86040961bbf4",cargo="030151";
const root="https://erp.dotcompany.com.br/api/v1",token=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
const sb=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const svc=process.env.SUPABASE_SERVICE_ROLE_KEY;
const h={apikey:svc,Authorization:"Bearer "+svc,Accept:"application/json","Content-Type":"application/json"};
const log=s=>console.log("CTE_ALT_030151: "+s);
const enc=encodeURIComponent;
async function db(table,query="",method="GET",data,prefer){
 const r=await fetch(sb+"/rest/v1/"+table+(query?"?"+query:""),{
  method,headers:{...h,...(prefer?{Prefer:prefer}:{})},
  ...(data===undefined?{}:{body:JSON.stringify(data)}),
  cache:"no-store",signal:AbortSignal.timeout(16000),
 });
 const raw=await r.text();
 if(!r.ok)throw Error("DATABASE_HTTP_"+r.status);
 try{return JSON.parse(raw)}catch{return null}
}
const first=async(t,q,select)=>((await db(t,q+"&select="+enc(select)+"&limit=1"))||[])[0]||null;
const record=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:{};
const digits=x=>String(x??"").replace(/\D/g,"");
async function api(path,method="GET",data,key){
 const r=await fetch(root+path,{
  method,headers:{Authorization:"Bearer "+token,Accept:"application/json",
    ...(data===undefined?{}:{"Content-Type":"application/json"}),
    ...(key?{"Idempotency-Key":key}:{})},
  ...(data===undefined?{}:{body:JSON.stringify(data)}),
  cache:"no-store",signal:AbortSignal.timeout(25000)
 });
 const result=await r.json().catch(()=>null);
 return {http:r.status,ok:r.ok,data:record(result)};
}
function documentData(x){const v=record(x);return record(v.data?.cte||v.cte||v.data||v.documento||v);}
function matchesDoc(item,notes) {
 const s=JSON.stringify(item);
 const key=String(notes[0]?.access_key||"");
 // Alternate API may omit related invoice details in GET; only reject explicit conflicting keys.
 const keys=Array.from(s.matchAll(/\d{44}/g),m=>m[0]);
 return !keys.length||keys.includes(key);
}
async function main(){
 if(process.env.VERCEL_ENV!=="production")return log("SKIP_ENV");
 if(!/^dc_live_[a-zA-Z0-9._-]{16,}$/.test(token||"")||!sb||!svc)return log("SKIP_CREDS");
 const op=await first("fiscal_cte_two_stage_operations",
  "workspace_id=eq."+workspace+"&cargo_reference=eq."+cargo+"&stage=eq.emit&status=eq.queued",
  "id,draft_id,provider_cte_id,idempotency_key,response_summary");
 if(!op||op.response_summary?.alternative_route!==true)return log("NOT_QUEUED_FOR_ALTERNATIVE");
 const claimed=await db("fiscal_cte_two_stage_operations","id=eq."+op.id+"&status=eq.queued",
  "PATCH",{status:"running",updated_at:new Date().toISOString()},"return=representation");
 if(!Array.isArray(claimed)||claimed.length!==1)return log("ALREADY_CLAIMED");
 const finish=async(status,summary,remoteId)=>
  db("fiscal_cte_two_stage_operations","id=eq."+op.id+"&status=eq.running",
   "PATCH",{status,provider_cte_id:remoteId===undefined?String(op.provider_cte_id):String(remoteId),
    response_summary:{...op.response_summary,...summary},updated_at:new Date().toISOString()},"return=minimal");
 let emissionStarted=false,remoteId=Number(op.provider_cte_id),creationStarted=false;
 try{
  if(remoteId!==63)throw Error("ORIGINAL_ID_CHANGED");
  const draft=await first("fiscal_drafts","id=eq."+op.draft_id+"&workspace_id=eq."+workspace,
   "id,status,cargo_reference,checklist,freight_value");
  const prior=await first("fiscal_cte_transmissions",
   "draft_id=eq."+op.draft_id+"&workspace_id=eq."+workspace,
   "id,status,error_code,access_key,protocol,provider_response");
  if(!draft||draft.status!=="draft"||draft.cargo_reference!==cargo||
     prior?.status!=="indeterminate"||prior.error_code!=="DOTCOMPANY_CERTIFICATE_SERVICE_FAILURE"||
     prior.access_key||prior.protocol)throw Error("PRIOR_STATUS_CHANGED");
  const notes=await db("fiscal_nfe_inbox",
   "workspace_id=eq."+workspace+"&cargo_reference=eq."+cargo+
   "&select="+enc("access_key,origin_uf,destination_uf,goods_value")+"&limit=40");
  if(!Array.isArray(notes)||notes.length!==1||! /^\d{44}$/.test(notes[0].access_key))
   throw Error("SINGLE_NFE_REQUIRED");
  if(notes[0].origin_uf!=="RJ"||notes[0].destination_uf!=="RJ")throw Error("ROUTE_CHANGED");
  const freight=Number(draft.freight_value);
  if(freight!==1800)throw Error("FREIGHT_CHANGED");
  const cfg=draft.checklist?.cte_provider_config||{};
  const people=draft.checklist?.cte_party_registry||{};
  const sender=Number(people.sender?.id),receiver=Number(people.recipient?.id);
  if(!Number.isSafeInteger(sender)||!Number.isSafeInteger(receiver)||sender<=0||receiver<=0)
   throw Error("FISCAL_PEOPLE_IDS_MISSING");

  // Read-only reconciliation of provider 63 and other similar emissions.
  const list=await api("/cte/listar","POST",{emitter_id:646,limite:200,offset:0});
  if(!list.ok||!Array.isArray(list.data.itens)||list.data.itens.length>=200)
   throw Error("PROVIDER_LIST_UNVERIFIED");
  const target=list.data.itens.filter(x=>Number(x.cte_id)===63);
  if(target.length!==1||String(target[0].status||"").toLowerCase()!=="rascunho")
   throw Error("ORIGINAL_DOCUMENT_NOT_DRAFT");
  const duplicates=list.data.itens.filter(x=>Number(x.cte_id)!==63&&
    ["autorizado","pendente"].includes(String(x.status||"").toLowerCase())&&
    x.uf_inicio==="RJ"&&x.uf_fim==="RJ"&&
    Math.abs(Number(x.valor_total_servico||0)-freight)<0.01);
  if(duplicates.length)throw Error("POSSIBLE_DUPLICATE_AUTHORIZED_OR_PENDING");

  // A second, independent fiscal API exposes GET id, POST create, POST emit.
  const read=await api("/fiscal/cte/63");
  if(read.ok){
   const doc=documentData(read.data);
   const id=Number(doc.cte_id??doc.id);
   const status=String(doc.status??doc.situacao??"").toLowerCase();
   if(id!==63||status!=="rascunho"||!matchesDoc(doc,notes))
    throw Error("ALTERNATIVE_ENDPOINT_DOCUMENT_MISMATCH");
   remoteId=63;
  }else if(read.http===404){
   // Alternative fiscal API does not contain the old document. Create ONE draft.
   const req={
    modal:"01",cfop:String(cfg.cfop||"5352"),
    remetente_id:sender,destinatario_id:receiver,
    tomador_tipo:String(cfg.tomador??"0"),
    valor_total_servico:freight,valor_receber:freight,
    nfe_chaves:notes.map(x=>x.access_key),
    natureza_operacao:"PRESTACAO DE SERVICO DE TRANSPORTE",
   };
   creationStarted=true;
   const create=await api("/fiscal/cte","POST",req,op.idempotency_key);
   const made=documentData(create.data);
   const id=Number(made.cte_id??made.id);
   if(!create.ok||!Number.isSafeInteger(id)||id<=0){
    await finish("unknown",{
      alternative_result:"CREATION_NOT_CONFIRMED",
      create_http:create.http,create_code:String(create.data.code||create.data.error_code||"").slice(0,100),
      safe_message:String(create.data.message||create.data.detail||"").slice(0,400),
     },63);
    return log("ALTERNATIVE_CREATE_FAILED_OR_UNCONFIRMED");
   }
   remoteId=id;
   // Persist new document identifier before any fiscal submission.
   await db("fiscal_cte_two_stage_operations","id=eq."+op.id+"&status=eq.running","PATCH",{
    provider_cte_id:String(id),
    response_summary:{...op.response_summary,alternate_cte_id:id,
      create_http:create.http,original_cte_id:63,route:"/api/v1/fiscal/cte"},
    updated_at:new Date().toISOString()
   },"return=minimal");
   const check=await api("/fiscal/cte/"+id);
   const checkDoc=documentData(check.data);
   if(!check.ok||Number(checkDoc.cte_id??checkDoc.id)!==id||
      !["rascunho","draft"].includes(String(checkDoc.status??checkDoc.situacao??"").toLowerCase())||
      !matchesDoc(checkDoc,notes))
    throw Error("NEW_ALT_DOC_NOT_RECONCILED");
  }else throw Error("ALTERNATE_LOOKUP_HTTP_"+read.http);

  // One attempt, no loop. The endpoint may be a different implementation.
  log("EMITTING_ALT_ROUTE_ONCE cteId="+remoteId);
  emissionStarted=true;
  let r;
  try{r=await api("/fiscal/cte/"+remoteId+"/emitir","POST",undefined,op.idempotency_key)}
  catch{
   await finish("unknown",{alternative_result:"EMISSION_NETWORK_UNCONFIRMED",alt_cte_id:remoteId},remoteId);
   return log("EMIT_NETWORK_UNKNOWN");
  }
  const v=documentData(r.data);
  const key=digits(v.chave_acesso||r.data.chave_acesso);
  const protocol=String(v.protocolo||r.data.protocolo||"");
  const status=String(v.status??r.data.status??"").toLowerCase();
  const authorized=(v.autorizado===true||r.data.autorizado===true||
    v.codigo_status_sefaz===100||r.data.codigo_status_sefaz===100||status==="autorizado");
  const summary={alternative_result:authorized?"PROVIDER_AUTHORIZED":"PROVIDER_NOT_AUTHORIZED",
    route:"/api/v1/fiscal/cte/{id}/emitir",alternate_cte_id:remoteId,
    emit_http:r.http,returnedAuthorized:authorized,
    hasAccessKey:key.length===44,hasProtocol:protocol.length>5,
    code:String(v.codigo_status_sefaz??r.data.codigo_status_sefaz??r.data.code??"").slice(0,30),
    safe_message:String(v.message??r.data.message??r.data.detail??"").slice(0,450)};
  if(r.ok&&authorized&&key.length===44&&protocol.length>5){
   await finish("authorized",summary,remoteId);
   const synced=await db("fiscal_cte_transmissions",
    "id=eq."+prior.id+"&workspace_id=eq."+workspace+"&status=eq.indeterminate",
    "PATCH",{status:"authorized",access_key:key,protocol,error_code:null,
      provider_response:{...prior.provider_response,alternative_approved_cte_id:remoteId,
        authorized:true,source:"alternative_fiscal_cte_api",series_status:status},
      updated_at:new Date().toISOString()},"return=representation");
   log(Array.isArray(synced)&&synced.length===1?"AUTHORIZED_AND_SYNCED":"AUTHORIZED_SYNC_REQUIRED");
  }else{
   await finish("unknown",summary,remoteId);
   log("ALT_EMIT_NOT_AUTHORIZED http="+r.http);
  }
 }catch(e){
  const reason=String(e?.message||"UNKNOWN").replace(/[^A-Z0-9_]/g,"").slice(0,120);
  try{await finish(emissionStarted||creationStarted?"unknown":"paused",
   {alternative_result:"STOPPED",reason,alternative_operation_started:creationStarted||emissionStarted},
   remoteId)}catch{}
  log("STOPPED "+reason);
 }
}
await main().catch(()=>log("UNHANDLED"));
