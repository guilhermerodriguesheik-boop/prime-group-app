/**
 * One-time production-only, READ-ONLY contract probe.
 * No fiscal create, emit, cancel, series change, or personal-data logging.
 */
const token=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
const db=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const base="https://erp.dotcompany.com.br";
const attempt="e2e4bc27-1377-4701-9bbf-0442b2537174";
const headers={Authorization:"Bearer "+token,Accept:"application/json"};
const dbHeaders={apikey:key,Authorization:"Bearer "+key,Accept:"application/json","Content-Type":"application/json"};
const doc=v=>String(v||"").replace(/\D/g,"");
async function get(url,auth){
 try{
  const r=await fetch(url,{headers:auth,signal:AbortSignal.timeout(10000),cache:"no-store"});
  const t=await r.text();
  let v=null;if(t.length<2500000)try{v=JSON.parse(t)}catch{}
  return {status:r.status,value:v};
 }catch{return {status:null,value:null};}
}
const report={checked_at:new Date().toISOString(),kind:"read_only_provider_probe"};
if(process.env.VERCEL_ENV!=="production"||!token||!db||!key){
 console.log("CTE_API_PROBE: skipped");
}else{
 try{
  const look=await get(db+"/rest/v1/fiscal_nfe_inbox?cargo_reference=eq.030198&select=sender_cnpj,recipient_cnpj&limit=1",dbHeaders);
  const people=[];
  for(const field of ["sender_cnpj","recipient_cnpj"]){
   const cnpj=doc(look.value?.[0]?.[field]);
   if(!/^\d{14}$/.test(cnpj)){people.push({status:null,result:"missing_nfe_document"});continue;}
   const r=await get(base+"/api/v1/pessoas?cpf_cnpj="+encodeURIComponent(cnpj),headers);
   const v=r.value;
   people.push({status:r.status,keys:v&&typeof v==="object"?Object.keys(v).slice(0,20):[],
    entryCount:Array.isArray(v)?v.length:Array.isArray(v?.data)?v.data.length:
     Array.isArray(v?.pessoas)?v.pessoas.length:null,
    errorCode:typeof v?.code==="string"?v.code.slice(0,70):null});
  }
  report.people=people;
  const o=await get(base+"/api/v1/openapi.json",headers);
  report.openapi={status:o.status,keys:o.value&&typeof o.value==="object"?Object.keys(o.value).slice(0,20):[],
   isSpec:!!o.value?.paths||!!o.value?.openapi,contentType:"json_or_empty"};
  const paths=o.value?.paths;
  if(paths&&typeof paths==="object"){
   report.endpoints=Object.keys(paths).filter(s=>s.includes("cte")||s.includes("fiscal-profile")||s.includes("pessoas")).slice(0,60);
   const fiscal=Object.keys(paths).find(s=>s.includes("emitters")&&s.endsWith("fiscal-profile"));
   const schema=paths[fiscal]?.put?.requestBody?.content?.["application/json"]?.schema;
   report.fiscalPutSchema=schema?{required:schema.required??[],
    propertyKeys:Object.keys(schema.properties??{}).slice(0,70)}:null;
   const cte=Object.keys(paths).find(s=>s.endsWith("/cte/criar"));
   const cteSchema=paths[cte]?.post?.requestBody?.content?.["application/json"]?.schema;
   report.cteDraftSchema=cteSchema?{required:cteSchema.required??[],
    propertyKeys:Object.keys(cteSchema.properties??{}).slice(0,70)}:null;
  }
 }catch{report.probeFailed=true;}
 try{
  const old=await get(db+"/rest/v1/fiscal_cte_transmissions?id=eq."+attempt+"&select=provider_response",dbHeaders);
  if(Array.isArray(old.value)&&old.value.length===1){
   const previous=old.value[0].provider_response??{};
   const save=await fetch(db+"/rest/v1/fiscal_cte_transmissions?id=eq."+attempt,{method:"PATCH",
    headers:{...dbHeaders,Prefer:"return=minimal"},
    body:JSON.stringify({provider_response:{...previous,api_contract_probe:report}}),
    signal:AbortSignal.timeout(10000)});
   console.log("CTE_API_PROBE: stored="+save.status+" people_get="+people_status(report.people));
  }
 }catch{console.log("CTE_API_PROBE: storage unavailable");}
}
function people_status(value){return Array.isArray(value)?value.map(x=>x.status).join(","):"none";}
