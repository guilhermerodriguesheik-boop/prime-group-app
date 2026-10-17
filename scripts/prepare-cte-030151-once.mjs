/**
 * Production-only, one-shot CT-e draft creation.
 * NO /cte/emitir call exists in this script.
 * Operation is claimed atomically (queued -> running) before provider contact.
 */
const cargo="030151",workspace="02d2e803-11ab-46e4-b546-86040961bbf4";
const key=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:secret,Authorization:"Bearer "+secret,"Content-Type":"application/json",Accept:"application/json"};
function log(message){console.log("CTE_DRAFT_ONLY: "+message);}
async function db(table,query="",method="GET",body,prefer){
 const res=await fetch(url+"/rest/v1/"+table+(query?"?"+query:""),{
  method,headers:{...headers,...(prefer?{Prefer:prefer}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(17000),cache:"no-store"
 });
 const raw=await res.text();
 if(!res.ok)throw Error("DATABASE_HTTP_"+res.status);
 try{return JSON.parse(raw)}catch{return null}
}
const enc=encodeURIComponent;
const one=async(table,filter,cols)=>((await db(table,filter+"&select="+enc(cols)+"&limit=1"))||[])[0]||null;
const norm=x=>String(x||"").replace(/\D/g,"");
async function main(){
 if(process.env.VERCEL_ENV!=="production")return log("skipped outside production");
 if(!key||!/^dc_live_[A-Za-z0-9._-]{16,}$/.test(key)||!url||!secret)
  return log("skipped missing protected environment variables");
 const queued=await one("fiscal_cte_two_stage_operations",
  "workspace_id=eq."+workspace+"&cargo_reference=eq."+cargo+"&stage=eq.create&status=eq.queued",
  "id,draft_id,idempotency_key");
 if(!queued)return log("nothing queued");
 const claimed=await db("fiscal_cte_two_stage_operations",
  "id=eq."+queued.id+"&status=eq.queued","PATCH",
  {status:"running",updated_at:new Date().toISOString()},"return=representation");
 if(!Array.isArray(claimed)||claimed.length!==1)return log("claimed by another execution");
 const finish=async(status,response_summary,provider_cte_id=null)=>
   db("fiscal_cte_two_stage_operations","id=eq."+queued.id+"&status=eq.running","PATCH",
   {status,response_summary,provider_cte_id,updated_at:new Date().toISOString()},"return=minimal");
 try{
  const d=await one("fiscal_drafts","id=eq."+queued.draft_id+"&workspace_id=eq."+workspace,
   "id,cargo_reference,status,checklist,freight_value,driver_id,vehicle_id");
  if(!d||d.status!=="draft"||d.cargo_reference!==cargo)throw Error("DRAFT_STATUS_CHANGED");
  const last=await one("fiscal_cte_transmissions","draft_id=eq."+d.id+"&workspace_id=eq."+workspace,
   "status,error_code,access_key,protocol");
  if(!last||last.status!=="indeterminate"||
     last.error_code!=="DOTCOMPANY_CERTIFICATE_SERVICE_FAILURE"||
     last.access_key||last.protocol)throw Error("PRIOR_ATTEMPT_CHANGED");
  const sender=d.checklist?.cte_party_registry?.sender?.id,
   receiver=d.checklist?.cte_party_registry?.recipient?.id;
  if(!sender||!receiver)throw Error("PARTY_IDS_MISSING");
  const cfg=d.checklist?.cte_provider_config||{};
  const notes=await db("fiscal_nfe_inbox","workspace_id=eq."+workspace+"&cargo_reference=eq."+cargo+
    "&select="+enc("access_key,origin_uf,destination_uf,goods_value,gross_weight_kg")+"&limit=41");
  if(!Array.isArray(notes)||notes.length<1||notes.length>40||
     notes.some(n=>!/^\d{44}$/.test(String(n.access_key||""))))
    throw Error("INVOICE_INPUTS_INVALID");
  const driver=await one("drivers","id=eq."+d.driver_id+"&workspace_id=eq."+workspace,
   "id,name,document,active");
  const vehicle=await one("vehicles","id=eq."+d.vehicle_id+"&workspace_id=eq."+workspace,
   "id,plate,status");
  if(!driver?.active||vehicle?.status!=="active")throw Error("DRIVER_OR_VEHICLE_INVALID");
  const start=String(notes[0].origin_uf||""),dest=String(notes[0].destination_uf||"");
  if(notes.some(n=>n.origin_uf!==start||n.destination_uf!==dest))throw Error("INVOICE_ROUTE_CONFLICT");
  const value=Number(d.freight_value),goods=notes.reduce((s,n)=>s+Number(n.goods_value||0),0),
   weight=notes.reduce((s,n)=>s+Number(n.gross_weight_kg||0),0);
  if(![value,goods,weight].every(v=>Number.isFinite(v)&&v>0))throw Error("FREIGHT_VALUES_INVALID");
  const payload={
   uf_inicio:start,uf_fim:dest,cfop:cfg.cfop,modal:"01",
   tomador:cfg.tomador,produto_predominante:cfg.produto_predominante,
   peso_bruto:weight,valor_carga:goods,valor_frete:value,
   remetente_id:String(sender),destinatario_id:String(receiver),
   documentos:notes.map(n=>({chave_acesso:n.access_key})),
   veiculos:[{placa:String(vehicle.plate).toUpperCase().replace(/[^A-Z0-9]/g,""),
    uf_licenciamento:cfg.uf_licenciamento}],
   motoristas:[{cpf:norm(driver.document),nome:driver.name}],
   idempotency_key:queued.idempotency_key
  };
  log("requesting cte.criar only; no SEFAZ transmission");
  let response,body;
  try{
   response=await fetch("https://erp.dotcompany.com.br/api/v1/cte/criar",{
    method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json",
      Accept:"application/json","Idempotency-Key":queued.idempotency_key},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(24000),cache:"no-store"
   });
   body=await response.json().catch(()=>null);
  }catch{
   await finish("unknown",{reason:"NETWORK_RESULT_INCONCLUSIVE",note:"Only cte.criar was attempted"});
   return log("network result unknown");
  }
  const p=body&&typeof body==="object"&&!Array.isArray(body)?body:{};
  const sub=p.data&&typeof p.data==="object"?p.data:p.cte&&typeof p.cte==="object"?p.cte:p;
  const ctId=sub?.cte_id??sub?.id??sub?.documento_id;
  const id=(typeof ctId==="string"||typeof ctId==="number")?String(ctId):null;
  const details={http:response.status,operation:"cte.criar",hasProviderId:!!id,
    responseKeys:Object.keys(p).slice(0,25),
    code:String(p.codigo??p.code??p.error_code??"").slice(0,100),
    message:String(p.message??p.mensagem??p.detail??p.erro?.titulo??"").slice(0,480),
    returnedAuthorized:p.autorizado===true,
    note:"Draft only; cte.emitir was not called. Existing inconclusive fiscal emission was not repeated."};
  const state=response.ok&&id&&p.autorizado!==true?"prepared":
    response.ok&&p.autorizado===true?"unknown":"failed";
  await finish(state,details,id);
  log("http="+response.status+" state="+state+" hasId="+!!id);
 }catch(e){
  const reason=String(e?.message||"UNKNOWN").replace(/[^A-Z0-9_]/g,"").slice(0,90);
  try{await finish("failed",{reason})}catch{}
  log("local failure "+reason);
 }
}
await main().catch(()=>log("unhandled error"));
