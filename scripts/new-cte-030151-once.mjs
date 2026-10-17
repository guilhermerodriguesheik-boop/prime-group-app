/**
 * One authorized, non-looping CT-e replacement-draft test for cargo 030151.
 * Only production build with manually queued Supabase operation can run it.
 * Never reissues automatically or treats an HTTP 200 without fiscal protocol as authorization.
 */
const workspace="02d2e803-11ab-46e4-b546-86040961bbf4",cargo="030151";
const root="https://erp.dotcompany.com.br/api/v1";
const token=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
const dburl=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const svc=process.env.SUPABASE_SERVICE_ROLE_KEY;
const dhead={apikey:svc,Authorization:"Bearer "+svc,Accept:"application/json","Content-Type":"application/json"};
const txt=x=>String(x??"").slice(0,450);
const log=x=>console.log("CTE_ONE_NEW_030151: "+x);
const digits=x=>String(x??"").replace(/\D/g,"");
const enc=encodeURIComponent;
async function database(table,query="",method="GET",body,prefer){
 const r=await fetch(dburl+"/rest/v1/"+table+(query?"?"+query:""),{
  method,headers:{...dhead,...(prefer?{Prefer:prefer}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(15000),cache:"no-store"
 });
 const raw=await r.text();
 if(!r.ok)throw Error("DATABASE_HTTP_"+r.status);
 try{return JSON.parse(raw)}catch{return null}
}
const one=async(t,q,cols)=>((await database(t,q+"&select="+enc(cols)+"&limit=1"))||[])[0]||null;
const obj=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:{};
async function dot(path,method="GET",body,key){
 const r=await fetch(root+path,{
  method,headers:{Authorization:"Bearer "+token,Accept:"application/json",
   ...(body===undefined?{}:{"Content-Type":"application/json"}),
   ...(key?{"Idempotency-Key":key}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(24000),cache:"no-store",
 });
 return {http:r.status,ok:r.ok,data:obj(await r.json().catch(()=>null))};
}
async function main(){
 if(process.env.VERCEL_ENV!=="production")return log("SKIP_NOT_PRODUCTION");
 if(!token?.startsWith("dc_live_")||!dburl||!svc)return log("SKIP_MISSING_CREDS");
 const op=await one("fiscal_cte_two_stage_operations",
  "workspace_id=eq."+workspace+"&cargo_reference=eq."+cargo+"&stage=eq.emit&status=eq.queued",
  "id,draft_id,provider_cte_id,idempotency_key,response_summary");
 if(!op||op.response_summary?.new_draft_attempt!==true)return log("NOT_QUEUED");
 const lock=await database("fiscal_cte_two_stage_operations",
  "id=eq."+op.id+"&status=eq.queued","PATCH",
  {status:"running",updated_at:new Date().toISOString()},"return=representation");
 if(!Array.isArray(lock)||lock.length!==1)return log("ALREADY_CLAIMED");
 let providerId=63,started=false;
 const save=async(status,summary,id=providerId)=>
  database("fiscal_cte_two_stage_operations","id=eq."+op.id+"&status=eq.running",
   "PATCH",{status,provider_cte_id:String(id),
    response_summary:{...op.response_summary,...summary},updated_at:new Date().toISOString()},"return=minimal");
 try{
  const d=await one("fiscal_drafts","id=eq."+op.draft_id+"&workspace_id=eq."+workspace,
   "id,status,cargo_reference,freight_value,checklist,driver_id,vehicle_id");
  const prev=await one("fiscal_cte_transmissions","draft_id=eq."+op.draft_id+"&workspace_id=eq."+workspace,
   "id,status,error_code,access_key,protocol,provider_response");
  if(!d||d.status!=="draft"||d.cargo_reference!==cargo||
   d.checklist?.do_not_issue_duplicate===true||
   prev?.status!=="indeterminate"||prev.error_code!=="DOTCOMPANY_CERTIFICATE_SERVICE_FAILURE"||
   prev.access_key||prev.protocol)throw Error("FISCAL_HISTORY_CHANGED");
  const nfes=await database("fiscal_nfe_inbox",
   "workspace_id=eq."+workspace+"&cargo_reference=eq."+cargo+
   "&select="+enc("access_key,origin_uf,destination_uf,goods_value,gross_weight_kg")+"&limit=40");
  if(!Array.isArray(nfes)||nfes.length!==1||!/^\d{44}$/.test(String(nfes[0].access_key)))
   throw Error("NFES_NOT_IDENTIFIED");
  const driver=await one("drivers","workspace_id=eq."+workspace+"&id=eq."+d.driver_id,
   "name,document,active");
  const vehicle=await one("vehicles","workspace_id=eq."+workspace+"&id=eq."+d.vehicle_id,
   "plate,status");
  if(!driver?.active||vehicle?.status!=="active")throw Error("TRANSPORT_REGISTRY_CHANGED");
  const cfg=obj(d.checklist?.cte_provider_config);
  const reg=obj(d.checklist?.cte_party_registry);
  const sender=Number(reg.sender?.id),recipient=Number(reg.recipient?.id);
  if(!Number.isSafeInteger(sender)||!Number.isSafeInteger(recipient)||sender<=0||recipient<=0)
   throw Error("PERSON_IDS_MISSING");
  const freight=Number(d.freight_value);
  if(freight!==1800||nfes[0].origin_uf!=="RJ"||nfes[0].destination_uf!=="RJ")
   throw Error("TRANSPORT_VALUES_CHANGED");

  const list=await dot("/cte/listar","POST",{emitter_id:646,limite:200,offset:0});
  if(!list.ok||!Array.isArray(list.data.itens)||list.data.itens.length>=200)
   throw Error("UNVERIFIED_FISCAL_LISTING");
  const old=list.data.itens.filter(x=>Number(x.cte_id)===63);
  if(old.length!==1||String(old[0].status||"").toLowerCase()!=="rascunho")
   throw Error("ORIGINAL_DOCUMENT_NO_LONGER_DRAFT");
  const overlaps=list.data.itens.filter(x=>Number(x.cte_id)!==63&&
   ["autorizado","pendente"].includes(String(x.status||"").toLowerCase())&&
   x.uf_inicio==="RJ"&&x.uf_fim==="RJ"&&
   Math.abs(Number(x.valor_total_servico||0)-freight)<0.01);
  if(overlaps.length)throw Error("POSSIBLE_AUTHORIZED_DUPLICATE");

  const payload={
   uf_inicio:"RJ",uf_fim:"RJ",
   cfop:txt(cfg.cfop||"5352"),modal:"01",tomador:txt(cfg.tomador??"0"),
   produto_predominante:txt(cfg.produto_predominante||"Diversos"),
   remetente_id:sender,destinatario_id:recipient,
   peso_bruto:Number(nfes[0].gross_weight_kg),
   valor_carga:Number(nfes[0].goods_value),valor_frete:freight,
   ...(String(cfg.compliance?.municipio_inicio_ibge||"").length===7?
     {cod_municipio_inicio:String(cfg.compliance.municipio_inicio_ibge)}:{}),
   ...(String(cfg.compliance?.municipio_fim_ibge||"").length===7?
     {cod_municipio_fim:String(cfg.compliance.municipio_fim_ibge)}:{}),
   emitter_id:646,
   documentos:[{chave_acesso:nfes[0].access_key}],
   veiculos:[{placa:String(vehicle.plate||"").replace(/[^A-Z0-9]/gi,"").toUpperCase(),
    uf_licenciamento:txt(cfg.uf_licenciamento||"RJ")}],
   motoristas:[{cpf:digits(driver.document),nome:txt(driver.name)}],
   idempotency_key:op.idempotency_key,
  };
  log("CREATING_ONE_NEW_DRAFT_FROM_VERIFIED_030151");
  started=true;
  let created;
  try{created=await dot("/cte","POST",payload,op.idempotency_key)}
  catch{await save("unknown",{last_result:"CREATION_NETWORK_UNKNOWN"});return log("CREATION_UNKNOWN");}
  providerId=Number(created.data.cte_id??created.data.data?.cte_id);
  if(!created.ok||!Number.isSafeInteger(providerId)||providerId<=0){
   await save("unknown",{last_result:"CREATION_NOT_ACCEPTED",
    create_http:created.http,
    error_code:txt(created.data.error_code??created.data.code),
    message:txt(created.data.message??created.data.detail)},63);
   return log("CREATE_NOT_ACCEPTED");
  }
  await database("fiscal_cte_two_stage_operations","id=eq."+op.id+"&status=eq.running",
   "PATCH",{provider_cte_id:String(providerId),
    response_summary:{...op.response_summary,original_cte_id:63,new_cte_id:providerId,
     create_http:created.http,new_cte_status:txt(created.data.status)},
    updated_at:new Date().toISOString()},"return=minimal");
  if(!["rascunho","draft"].includes(String(created.data.status).toLowerCase())){
   await save("paused",{last_result:"NEW_DOC_STATUS_NOT_DRAFT",new_cte_id:providerId});
   return log("NEW_DOC_STATUS_NOT_DRAFT");
  }
  const reread=await dot("/cte/listar","POST",{emitter_id:646,limite:200,offset:0});
  if(!reread.ok||!Array.isArray(reread.data.itens)||
    !reread.data.itens.some(x=>Number(x.cte_id)===providerId&&
      String(x.status||"").toLowerCase()==="rascunho")){
   await save("paused",{last_result:"NEW_DOC_NOT_VERIFIED",new_cte_id:providerId});
   return log("NEW_DOC_NOT_VERIFIED");
  }
  const emissionKey=op.idempotency_key+"-emit";
  await database("fiscal_cte_two_stage_operations","id=eq."+op.id+"&status=eq.running",
   "PATCH",{response_summary:{...op.response_summary,original_cte_id:63,new_cte_id:providerId,
    new_cte_status:"rascunho",creation_http:created.http,emission_idempotency_key:emissionKey},
    updated_at:new Date().toISOString()},"return=minimal");
  log("EMITTING_NEW_DRAFT_ONCE id="+providerId);
  let res;
  try{res=await dot("/cte/emitir","POST",{
   cte_id:providerId,emitter_id:646,idempotency_key:emissionKey},emissionKey)}
  catch{await save("unknown",{last_result:"EMISSION_NETWORK_UNKNOWN",new_cte_id:providerId});return log("EMIT_UNKNOWN");}
  const key=digits(res.data.chave_acesso),protocol=String(res.data.protocolo||"");
  const authorized=res.ok&&res.data.autorizado===true&&key.length===44&&protocol.length>5;
  const summary={last_result:authorized?"AUTHORIZED":"NOT_AUTHORIZED",
   new_cte_id:providerId,create_http:created.http,emit_http:res.http,
   returnedAuthorized:res.data.autorizado===true,hasAccessKey:key.length===44,
   hasProtocol:protocol.length>5,error_code:txt(res.data.codigo_status_sefaz||""),
   message:txt(res.data.message??res.data.erro?.titulo)};
  await save(authorized?"authorized":"unknown",summary);
  if(authorized){
   const synced=await database("fiscal_cte_transmissions",
    "id=eq."+prev.id+"&workspace_id=eq."+workspace+"&status=eq.indeterminate",
    "PATCH",{status:"authorized",error_code:null,access_key:key,protocol,
      provider_response:{...prev.provider_response,authorized:true,
       new_cte_id:providerId,source:"separate_new_prepaid_cte"},updated_at:new Date().toISOString()},
    "return=representation");
   log(Array.isArray(synced)&&synced.length===1?"AUTHORIZED_AND_SYNCED":"AUTHORIZED_NEEDS_SYNC");
  }else log("NEW_CTE_NOT_AUTHORIZED http="+res.http);
 }catch(e){
  const reason=String(e?.message||"UNKNOWN").replace(/[^A-Z0-9_]/g,"").slice(0,120);
  try{await save(started?"unknown":"paused",{last_result:"STOPPED",reason})}catch{}
  log("STOPPED "+reason);
 }
}
await main().catch(()=>log("FATAL_UNKNOWN"));
