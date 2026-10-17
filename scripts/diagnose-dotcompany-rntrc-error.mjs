/**
 * One-time production diagnostic of previously rejected RNTRC-only PUT.
 * Run manually as isolated build preflight: no emission, no numbering/tax changes.
 * Safe result (status, error codes and sanitized field names) stored in Supabase.
 */
const api="https://erp.dotcompany.com.br/api/v1/emitters/646/fiscal-profile";
const token=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
const supabase=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
const id="717584a2-a3bd-4cd6-95d4-f4316e802665";
const auth={Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json"};
const onlyDigits=s=>String(s||"").replace(/\D/g,"");
const rec=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const result={checked_at:new Date().toISOString(),status:null,provider_code:null,fields:[],messages:[],state:"NOT_ATTEMPTED"};
function summary(v,depth=0){
 if(depth>3)return {type:"nested"};
 if(Array.isArray(v))return {type:"array",items:v.slice(0,5).map(x=>summary(x,depth+1))};
 if(rec(v))return Object.fromEntries(Object.entries(v).slice(0,35).map(([k,val])=>{
  if(/senha|token|key|secret|certificad|access|header|cpf|cnpj|rntrc|password|endereco/i.test(k))return [k,"[REDACTED]"];
  if(typeof val==="string")return [k,val.slice(0,160).replace(/dc_(?:live|test)_[A-Za-z0-9._-]+/g,"[REDACTED]")];
  if(typeof val==="number"||typeof val==="boolean")return [k,val];
  return [k,summary(val,depth+1)];
 }));
 return v;
}
async function get(url,headers){
 const r=await fetch(url,{method:"GET",headers,cache:"no-store",signal:AbortSignal.timeout(12000)});
 const v=await r.json().catch(()=>null);
 return {status:r.status,v};
}
async function run(){
 if(process.env.VERCEL_ENV!=="production"||!token||!supabase||!service){console.log("RNTRC_DIAG: skipped");return;}
 try{
  const before=await get(api,auth);
  if(before.status!==200||onlyDigits(before.v?.cnpj)!=="42361401000117"){
   result.state="WRONG_ISSUER_OR_LOOKUP_FAILED";return;
  }
  result.current_ready_cte=before.v.pronta_cte===true;
  const current=onlyDigits(before.v?.perfil?.rntrc);
  if(current==="057592188"){result.state="ALREADY_PRESENT";return;}
  if(current){result.state="DIFFERENT_RNTRC";return;}
  // Exactly the same idempotent RNTRC correction attempted previously.
  const put=await fetch(api,{method:"PUT",headers:auth,
   body:JSON.stringify({rntrc:"057592188"}),cache:"no-store",signal:AbortSignal.timeout(12000)});
  const body=await put.text();
  let payload=null;try{payload=JSON.parse(body)}catch{}
  result.status=put.status;
  result.provider_code=(put.headers.get("x-error-code")||"").slice(0,80);
  result.provider_response=summary(payload);
  const after=await get(api,auth);
  result.after_http=after.status;
  result.after_matches=onlyDigits(after.v?.perfil?.rntrc)==="057592188";
  result.ready_cte=after.v?.pronta_cte===true;
  result.state=result.after_matches?"RNTRC_APPLIED":"RNTRC_NOT_APPLIED";
 }catch{result.state="REQUEST_FAILED";}
 finally{
  const headers={apikey:service,Authorization:"Bearer "+service,Accept:"application/json","Content-Type":"application/json"};
  try{
   const rs=await fetch(supabase+"/rest/v1/fiscal_cte_transmissions?id=eq."+id+"&select=provider_response",{headers,signal:AbortSignal.timeout(9000)});
   const rows=rs.ok?await rs.json():[];
   if(rows.length===1){
    const old=rec(rows[0].provider_response)?rows[0].provider_response:{};
    const saved=await fetch(supabase+"/rest/v1/fiscal_cte_transmissions?id=eq."+id,{
     method:"PATCH",headers:{...headers,Prefer:"return=minimal"},
     body:JSON.stringify({provider_response:{...old,rntrc_put_diagnostic:result}}),
     signal:AbortSignal.timeout(9000)});
    console.log("RNTRC_DIAG: saved="+saved.status+" state="+result.state+" provider="+result.status);
   }
  }catch{console.log("RNTRC_DIAG: unable to save; no changes to fiscal history");}
 }
}
await run();