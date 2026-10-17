/**
 * Temporary PRODUCTION-ONLY read-only diagnostic: do not log API token, entire fiscal
 * profile, personal data, certificate or file contents.
 * Probe PUBLIC OpenAPI contract and current issuer readiness to choose a safe fix.
 * No PUT/POST or SEFAZ action performed by this script.
 */
const BASE="https://erp.dotcompany.com.br";
const TOKEN=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
const PROJECT=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY;
const ATTEMPT_ID="717584a2-a3bd-4cd6-95d4-f4316e802665";
const stamp=new Date().toISOString();
const result={checked_at:stamp,source:"read-only OpenAPI & issuer profile",schema_sources:[],schema:null,profile:null};
function rec(v){return v!==null&&typeof v==="object"&&!Array.isArray(v)}
const GET=async(url,withAuth)=>{
 try{
  const res=await fetch(url,{method:"GET",cache:"no-store",
   headers:withAuth?{Authorization:"Bearer "+TOKEN,Accept:"application/json"}:{Accept:"application/json"},
   signal:AbortSignal.timeout(9000)});
  const ct=res.headers.get("content-type")||"";
  let data=null;
  if(res.ok && (/json/i.test(ct)||url.includes("openapi.json")||url.endsWith("/swagger.json"))){
   const raw=await res.text();
   if(raw.length<3_000_000)try{data=JSON.parse(raw)}catch{}
  }else await res.body?.cancel();
  return {status:res.status,ct:ct.slice(0,60),data};
 }catch{return {status:null,ct:"NETWORK_ERROR",data:null};}
};
function compactSchema(v,components,seen=new Set(),depth=0){
 if(!rec(v)||depth>4)return null;
 if(typeof v.$ref==="string"){
  const name=v.$ref.split("/").pop();
  if(!name||seen.has(name))return {ref:name,recursive:true};
  const next=components?.schemas?.[name];
  return {ref:name,...compactSchema(next,components,new Set([...seen,name]),depth+1)};
 }
 const result={};
 if(Array.isArray(v.required))result.required=v.required.slice(0,60);
 if(typeof v.type==="string")result.type=v.type;
 if(Array.isArray(v.enum))result.enum=v.enum.slice(0,12);
 if(rec(v.properties))result.properties=Object.fromEntries(
  Object.entries(v.properties).filter(([key])=>/^(?:rntrc|cte|mdfe|serie|proximo|numero|crt|ie|cpf|cnpj|endereco|uf|regime|aliquota|cst|ambiente|perfil|habilit|transport)/i.test(key))
  .slice(0,80).map(([k,prop])=>[k,compactSchema(prop,components,seen,depth+1)||{type:prop?.type||"unknown"}])
 );
 if(rec(v.items))result.items=compactSchema(v.items,components,seen,depth+1);
 if(Array.isArray(v.oneOf))result.oneOf=v.oneOf.slice(0,6).map(x=>compactSchema(x,components,seen,depth+1));
 if(Array.isArray(v.allOf))result.allOf=v.allOf.slice(0,6).map(x=>compactSchema(x,components,seen,depth+1));
 return result;
}
async function main(){
 if(process.env.VERCEL_ENV!=="production"||!TOKEN||!PROJECT||!SERVICE){
  console.log("DOTCOMPANY_SCHEMA_DIAG: skipped");return;
 }
 const profile=await GET(BASE+"/api/v1/emitters/646/fiscal-profile",true);
 if(rec(profile.data)&&String(profile.data.cnpj||"").replace(/\D/g,"")==="42361401000117"){
  const p=rec(profile.data.perfil)?profile.data.perfil:{};
  result.profile={status:profile.status,pronta_cte:profile.data.pronta_cte,
   pronta_mdfe:profile.data.pronta_mdfe,
   keys:Object.keys(p).filter(k=>/rntrc|cte|mdfe|serie|numero|aliquota|cst/i.test(k)).slice(0,30),
   presence:Object.fromEntries(["rntrc","cte_cst_icms","cte_aliquota_icms","numero","serie_nfe"].map(k=>[k,
    p[k]===null||p[k]===undefined||p[k]===""?"empty":"present"])),
   numbering:(Array.isArray(profile.data.numeracao)?profile.data.numeracao:[])
    .slice(0,10).map(x=>({modelo:String(x?.modelo||""),serie:String(x?.serie||""),
     proximo_numero:String(x?.proximo_numero||"")}))};
 }
 const candidates=[
  "https://app.dotcompany.com.br/api/v1/openapi.json",
  "https://app.dotcompany.com.br/api/v1/swagger.json",
  "https://app.dotcompany.com.br/openapi.json",
  BASE+"/api/v1/openapi.json",
  BASE+"/api/v1/swagger.json",
  BASE+"/openapi.json",
 ];
 for(const url of candidates){
  const q=await GET(url,false);
  result.schema_sources.push({url,status:q.status,content_type:q.ct,hasOpenApi:!!(q.data?.openapi||q.data?.swagger)});
  if(!q.data?.paths)continue;
  const key=Object.keys(q.data.paths).find(k=>k.includes("/emitters/")&&k.endsWith("/fiscal-profile"));
  if(key){
   const operation=q.data.paths[key]?.put;
   const body=operation?.requestBody?.content?.["application/json"]?.schema;
   result.schema={
    endpoint:key,operation_available:!!operation,
    body:compactSchema(body,q.data.components),
    statusDescription:operation?.responses?.["422"]?.description?.slice(0,160)||null,
   };
   break;
  }
 }
 const headers={apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":"application/json",Accept:"application/json"};
 const prior=await GET(PROJECT+"/rest/v1/fiscal_cte_transmissions?id=eq."+ATTEMPT_ID+"&select=provider_response",false);
 // Supabase read uses server auth, so use fetch directly, unlike the public-only GET wrapper.
 const current=await fetch(PROJECT+"/rest/v1/fiscal_cte_transmissions?id=eq."+ATTEMPT_ID+"&select=provider_response",
  {headers,cache:"no-store",signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():[]).catch(()=>[]);
 if(Array.isArray(current)&&current.length===1){
  const old=rec(current[0].provider_response)?current[0].provider_response:{};
  const saved=await fetch(PROJECT+"/rest/v1/fiscal_cte_transmissions?id=eq."+ATTEMPT_ID,
   {method:"PATCH",headers:{...headers,Prefer:"return=minimal"},
    body:JSON.stringify({provider_response:{...old,fiscal_profile_schema_probe:result}}),
    signal:AbortSignal.timeout(10000)});
  console.log("DOTCOMPANY_SCHEMA_DIAG: save="+saved.status+
   " schema_found="+!!result.schema+" profile_read="+result.profile?.status);
 }else console.log("DOTCOMPANY_SCHEMA_DIAG: database audit unavailable");
}
main().catch(()=>console.log("DOTCOMPANY_SCHEMA_DIAG: request failed; no fiscal mutations"));
