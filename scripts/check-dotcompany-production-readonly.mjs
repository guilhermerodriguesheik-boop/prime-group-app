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
 const accepted=checks.some(s=>s===200);
 const rejected=checks.every(s=>s===401);
 console.log("DOTCOMPANY_DEPLOY_CHECK: usage_status="+checks[0]+" emitters_status="+checks[1]+" authenticated="+accepted+" both_rejected="+rejected);
}
