/**
 * PRODUCTION READ-ONLY fiscal reconciliation: run once per deploy.
 * Calls /cte/listar and GET emitter fiscal profile; NEVER calls emitir/cancelar.
 * Stores a bounded evidence snapshot alongside the original transmission error.
 * An empty provider list does NOT prove a CT-e wasn't emitted.
 */
if (process.env.VERCEL_ENV !== "production") {
 console.log("FISCAL_RECONCILE_CHECK: skipped outside production");
} else {
 const token = process.env.DOTCOMPANY_PRODUCTION_API_KEY;
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!token || !url || !key) {
  console.log("FISCAL_RECONCILE_CHECK: missing server configuration");
 } else {
  const dbHeaders = { apikey:key, Authorization:"Bearer "+key, Accept:"application/json",
   "Content-Type":"application/json" };
  const dbGet = async path => {
   const resp = await fetch(url+"/rest/v1/"+path,{
    headers:dbHeaders,cache:"no-store",signal:AbortSignal.timeout(12000)
   });
   if (!resp.ok) throw Error("DB_READ_HTTP_"+resp.status);
   return resp.json();
  };
  const providerFetch = async (path,method="POST") => {
   const resp = await fetch("https://erp.dotcompany.com.br/api/v1/"+path,{
    method, headers:{Authorization:"Bearer "+token,Accept:"application/json",
      ...(method==="POST"?{"Content-Type":"application/json"}:{})},
    ...(method==="POST"?{body:"{}"}:{}),
    cache:"no-store",signal:AbortSignal.timeout(14000),
   });
   const payload=await resp.text();
   let json=null;
   if(payload.length<350000) {try{json=JSON.parse(payload)}catch{}}
   return {status:resp.status,payload:json};
  };
  const pick=(row,fields)=>{
   const result={};
   for(const field of fields)if(["string","number","boolean"].includes(typeof row[field]))
    result[field]=String(row[field]).slice(0,100);
   return result;
  };
  const records=(obj,depth=0)=>{
   if(depth>5)return [];
   if(Array.isArray(obj))return obj.slice(0,100).flatMap(v=>records(v,depth+1));
   if(!obj||typeof obj!=="object")return [];
   const out=[];
   if(["id","chave_acesso","numero","status","idempotency_key","protocolo"]
     .some(x=>Object.prototype.hasOwnProperty.call(obj,x)))out.push(obj);
   for(const k of ["items","data","documentos","ctes","results","registros","resultado","lista"]){
    if(k in obj)out.push(...records(obj[k],depth+1));
   }
   return out.slice(0,120);
  };
  try {
   const attempts=await dbGet("fiscal_cte_transmissions?status=eq.indeterminate&select=id,draft_id,idempotency_key,provider_response&limit=10");
   if(!attempts.length){
    console.log("FISCAL_RECONCILE_CHECK: no indeterminate transmissions"); 
   }else {
    const drafts=await dbGet("fiscal_drafts?id=in.("+
     attempts.map(x=>x.draft_id).join(",")+")&select=id,cargo_reference");
    const cargos=drafts.map(x=>x.cargo_reference).filter(x=>/^[0-9]{1,12}$/.test(x||""));
    const nfe=cargos.length?await dbGet("fiscal_nfe_inbox?cargo_reference=in.("+
      cargos.join(",")+")&select=cargo_reference,access_key&limit=60"):[];
    let provider;
    try{
     provider=await providerFetch("cte/listar");
     if(provider.status===405)provider=await providerFetch("cte/listar","GET");
    }catch{provider={status:null,payload:null};}
    let profile;
    try{profile=await providerFetch("emitters/646/fiscal-profile","GET");}
    catch{profile={status:null,payload:null};}
    const allDocs=records(provider.payload);
    const fiscalProfile=profile.payload&&typeof profile.payload==="object"?
      pick(profile.payload,["serie_cte","proximo_numero_cte","tp_amb","cnpj","perfil_fiscal_completo"]):{};
    for(const attempt of attempts){
     const cargo=drafts.find(x=>x.id===attempt.draft_id)?.cargo_reference||"";
     const keys=nfe.filter(x=>x.cargo_reference===cargo).map(x=>x.access_key);
     const signatures=[cargo,attempt.idempotency_key,...keys].filter(Boolean);
     const matches=allDocs.filter(x=>signatures.some(sig=>
       JSON.stringify(x).includes(sig)
     )).slice(0,5).map(x=>pick(x,[
      "id","numero","serie","status","situacao","autorizado","chave_acesso","protocolo",
      "idempotency_key","codigo_status_sefaz"
     ]));
     const evidence={
      checked_at:new Date().toISOString(),
      cte_list_http_status:provider.status,
      total_rows_inspected:allDocs.length,
      possible_matches:matches,
      emitter_profile_http_status:profile.status,
      emitter_profile_summary:fiscalProfile,
      note:matches.length?
       "Possible match only. Verify CT-e access key and SEFAZ protocol before any release.":
       "No correlated row in read-only list. NOT evidence of rejection. Retry stays blocked.",
     };
     const original=attempt.provider_response&&typeof attempt.provider_response==="object"?
       attempt.provider_response:{};
     const response=await fetch(url+"/rest/v1/fiscal_cte_transmissions?id=eq."+attempt.id+
       "&status=eq.indeterminate",{
      method:"PATCH",headers:{...dbHeaders,Prefer:"return=minimal"},
      body:JSON.stringify({provider_response:{...original,reconciliation:evidence},
       updated_at:new Date().toISOString()}),
      signal:AbortSignal.timeout(12000),
     });
     console.log("FISCAL_RECONCILE_CHECK: result="+(response.ok?"saved":"save_http_"+response.status)+
       " provider_http="+provider.status+" matches="+matches.length+
       " fiscal_profile_http="+profile.status);
    }
   }
  }catch(error){
   const message=error instanceof Error&&/^DB_READ_HTTP_[0-9]+$/.test(error.message)?
      error.message:"request_failed";
   console.log("FISCAL_RECONCILE_CHECK: "+message);
  }
 }
}
