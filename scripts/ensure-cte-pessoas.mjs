/**
 * One-time production operation: register fiscal parties imported from official NF-e.
 * Does NOT transmit fiscal docs, alter numbering, or send email.
 */
const token=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspace="02d2e803-11ab-46e4-b546-86040961bbf4";
const root="https://erp.dotcompany.com.br/api/v1/pessoas";
const auth={Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json"};
const dbAuth={apikey:service,Authorization:"Bearer "+service,Accept:"application/json","Content-Type":"application/json"};
const clean=x=>String(x??"").replace(/\D/g,"");
const maybeObject=x=>x&&typeof x==="object"&&!Array.isArray(x);
async function parse(r){let s=await r.text();try{return JSON.parse(s)}catch{return {}}}
function list(data){
 if(Array.isArray(data))return data;
 if(!maybeObject(data))return [];
 for(const k of ["pessoas","data","items","results"]){if(Array.isArray(data[k]))return data[k];}
 return ("id" in data)?[data]:[];
}
function findId(data,cnpj){
 const matches=list(data).filter(p=>clean(p?.cpf_cnpj??p?.cnpj??p?.documento)===cnpj);
 const id=matches.length===1?(matches[0].id??matches[0].pessoa_id):null;
 return (typeof id==="string"||typeof id==="number")?String(id):null;
}
async function get(cnpj){
 const r=await fetch(root+"?cpf_cnpj="+encodeURIComponent(cnpj),{headers:auth,signal:AbortSignal.timeout(12000),cache:"no-store"});
 const b=await parse(r);return {status:r.status,id:r.ok?findId(b,cnpj):null};
}
async function ensure(cnpj,nome){
 if(!/^\d{14}$/.test(cnpj)||nome.length<5)return {state:"INVALID_IMPORTED_DATA"};
 let previous=await get(cnpj);
 if(previous.id)return {state:"EXISTING",id:previous.id};
 if(previous.status!==200)return {state:"LOOKUP_HTTP_"+previous.status};
 const r=await fetch(root,{method:"POST",headers:auth,body:JSON.stringify({cpf_cnpj:cnpj,nome}),
  signal:AbortSignal.timeout(15000),cache:"no-store"});
 const data=await parse(r);
 const direct=data?.id??data?.pessoa_id??data?.data?.id??data?.pessoa?.id;
 const returnedId=(typeof direct==="string"||typeof direct==="number")?String(direct):null;
 const after=await get(cnpj);
 return after.id?{state:"CREATED_AND_VERIFIED",id:after.id}:
  returnedId&&r.ok?{state:"CREATED_ID_RETURNED",id:returnedId}:
   {state:"REGISTRATION_HTTP_"+r.status,reason:String(data?.detail||data?.message||data?.mensagem||data?.code||"").slice(0,360)};
}
async function run(){
 if(process.env.VERCEL_ENV!=="production"||!token||!url||!service){
  console.log("CTE_PEOPLE_REGISTRY: skipped");return;
 }
 const df=await fetch(url+"/rest/v1/fiscal_drafts?workspace_id=eq."+workspace+
  "&cargo_reference=in.(030151,030198)&select=id,cargo_reference,checklist,updated_at",{
   headers:dbAuth,cache:"no-store",signal:AbortSignal.timeout(12000)});
 const drafts=df.ok?await parse(df):[];
 for(const d of drafts){
  const nf=await fetch(url+"/rest/v1/fiscal_nfe_inbox?workspace_id=eq."+workspace+
   "&cargo_reference=eq."+d.cargo_reference+"&select=sender_cnpj,sender_name,recipient_cnpj,recipient_name&limit=2",{
    headers:dbAuth,cache:"no-store",signal:AbortSignal.timeout(12000)});
  const notes=nf.ok?await parse(nf):[];
  if(notes.length!==1)continue;
  const report={at:new Date().toISOString()};
  for(const side of ["sender","recipient"]){
   const cnpj=clean(notes[0][side+"_cnpj"]);
   const name=String(notes[0][side+"_name"]||"").trim();
   report[side]=await ensure(cnpj,name);
  }
  const saved=await fetch(url+"/rest/v1/fiscal_drafts?id=eq."+d.id+
   "&updated_at=eq."+encodeURIComponent(d.updated_at),{method:"PATCH",
   headers:{...dbAuth,Prefer:"return=minimal"},
   body:JSON.stringify({checklist:{...(d.checklist||{}),cte_party_registry:report}}),
   signal:AbortSignal.timeout(11000)});
  console.log("CTE_PEOPLE_REGISTRY: cargo="+d.cargo_reference+" saved="+saved.status+
   " sender="+report.sender.state+" recipient="+report.recipient.state);
 }
}
await run().catch(()=>console.log("CTE_PEOPLE_REGISTRY: network error; no CT-e sent"));