/**
 * Vercel production-only read-only credential check. No CT-e/MDF-e transmission.
 * Writes ONLY HTTP status numbers and fixed booleans; never logs a token or response body.
 * Failure to reach provider does not block unrelated app deployments.
 */
const token=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
if(process.env.VERCEL_ENV!=="production"||!token){
 console.log("DOTCOMPANY_DEPLOY_CHECK: skipped (outside production or no configured key)");
}else{
 const checks=[];
 for(const path of ["/api/v1/usage","/api/v1/emitters"]){
  try{
   const response=await fetch("https://erp.dotcompany.com.br"+path,{
    method:"GET",
    headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    signal:AbortSignal.timeout(12000),
    cache:"no-store",
   });
   checks.push(response.status);
  }catch{
   checks.push("NETWORK_ERROR");
  }
 }
 // Probe only the documented listing family (never issue or cancel).
 // Log numerical statuses only; no fiscal payload, key or response body.
 const fiscalReadStatus={};
 for(const kind of ["cte","mdfe"]){
  try{
   const response=await fetch("https://erp.dotcompany.com.br/api/v1/"+kind+"/listar",{
    method:"POST",
    headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json"},
    body:"{}",signal:AbortSignal.timeout(12000),cache:"no-store",
   });
   fiscalReadStatus[kind]=response.status;
  }catch{fiscalReadStatus[kind]="NETWORK_ERROR";}
 }
 console.log("DOTCOMPANY_FISCAL_READONLY_CHECK: cte_list="+fiscalReadStatus.cte+" mdfe_list="+fiscalReadStatus.mdfe);
 const accepted=checks.some(s=>s===200);
 const rejected=checks.every(s=>s===401);
 console.log("DOTCOMPANY_DEPLOY_CHECK: usage_status="+checks[0]+" emitters_status="+checks[1]+" authenticated="+accepted+" both_rejected="+rejected);
 // Persist sanitized statuses independently of build-log availability.
 // No token, user information, or provider response is stored.
 const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const supabaseAdmin=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(supabaseUrl&&supabaseAdmin){
  try{
   const record={
    provider:"dotcompany",environment:"production",checked_at:new Date().toISOString(),
    usage_http_status:typeof checks[0]==="number"?checks[0]:null,
    emitters_http_status:typeof checks[1]==="number"?checks[1]:null,
    authenticated:accepted,
    check_error:checks.some(s=>s==="NETWORK_ERROR")?"NETWORK_ERROR":null,
   };
   const res=await fetch((supabaseUrl.endsWith("/")?supabaseUrl.slice(0,-1):supabaseUrl)+"/rest/v1/fiscal_provider_diagnostics?on_conflict=provider,environment",{
    method:"POST",
    headers:{"apikey":supabaseAdmin,"Authorization":"Bearer "+supabaseAdmin,
      "Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},
    body:JSON.stringify(record),signal:AbortSignal.timeout(12000)
   });
   console.log("DOTCOMPANY_DIAGNOSTIC_SAVE: "+(res.ok?"OK":"HTTP_"+res.status));
  }catch{
   console.log("DOTCOMPANY_DIAGNOSTIC_SAVE: NETWORK_ERROR");
  }
 }
}
