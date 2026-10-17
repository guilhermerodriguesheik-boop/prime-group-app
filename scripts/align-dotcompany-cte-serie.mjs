/**
 * One-time conservative correction of CT-e serie for Prime Group only.
 * Never issues documents; updates no NF-e/NFC-e numbering, RNTRC or taxes.
 */
const token=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
const endpoint="https://erp.dotcompany.com.br/api/v1/emitters/646/fiscal-profile";
const auditId="e2e4bc27-1377-4701-9bbf-0442b2537174";
const report={at:new Date().toISOString(),action:"cte_series_alignment",changed:false,reason:"NOT_STARTED"};
const fiscalHeaders={Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json"};
const dbHeaders={apikey:service,Authorization:"Bearer "+service,Accept:"application/json","Content-Type":"application/json"};
async function json(response){const raw=await response.text();try{return JSON.parse(raw)}catch{return {}}}
const list=value=>Array.isArray(value)?value:[];
function counter(profile){
 return list(profile?.numeracao).filter(row=>String(row?.modelo)==="57")
   .map(row=>({serie:String(row.serie||""),next:Number(row.proximo_numero)}));
}
async function run(){
 if(process.env.VERCEL_ENV!=="production"||!token||!url||!service){
  console.log("DOTCOMPANY_CTE_SERIE: skipped");return;
 }
 try{
  const read=await fetch(endpoint,{headers:fiscalHeaders,cache:"no-store",signal:AbortSignal.timeout(12000)});
  const p=await json(read);report.initialStatus=read.status;
  if(!read.ok||String(p.cnpj||"").replace(/\D/g,"")!=="42361401000117"){
   report.reason="ISSUER_NOT_VERIFIED";return;
  }
  report.before=counter(p);
  if(report.before.some(x=>x.serie==="3"&&x.next>=35)){
   report.reason="SERIES_3_ALREADY_PRESENT";return;
  }
  if(report.before.length!==1||report.before[0].serie!=="1"||
     report.before[0].next!==35||p.pronta_cte!==true){
   report.reason="COUNTER_CHANGED_OR_NOT_READY";return;
  }
  // Request only CT-e series and its next number. The provider may reject this
  // parameter combination if it does not allow CT-e series updates via API.
  const put=await fetch(endpoint,{method:"PUT",headers:fiscalHeaders,
   body:JSON.stringify({serie_cte:"3",proximo_numero_cte:35}),
   cache:"no-store",signal:AbortSignal.timeout(15000)});
  const body=await json(put);
  report.putHttp=put.status;
  report.errorCode=String(body?.code||put.headers.get("x-error-code")||"").slice(0,80);
  if(!put.ok){
   report.reason="PROVIDER_REJECTED_SERIES_UPDATE";
   report.errorDetail=String(body?.detail||body?.message||"").slice(0,500);return;
  }
  const verify=await fetch(endpoint,{headers:fiscalHeaders,cache:"no-store",signal:AbortSignal.timeout(12000)});
  const after=await json(verify);
  report.verifyHttp=verify.status;
  report.after=counter(after);
  report.changed=verify.ok&&report.after.some(x=>x.serie==="3"&&x.next===35);
  report.reason=report.changed?"SERIES_3_VERIFIED":"PROVIDER_DID_NOT_CHANGE_CTE_SERIES";
 }catch{report.reason="PROVIDER_UNREACHABLE";}
 finally{
  try{
   const r=await fetch(url+"/rest/v1/fiscal_cte_transmissions?id=eq."+auditId+"&select=provider_response",{headers:dbHeaders,signal:AbortSignal.timeout(11000)});
   const rows=r.ok?await json(r):[];
   if(rows.length===1){
    const previous=rows[0].provider_response&&typeof rows[0].provider_response==="object"?rows[0].provider_response:{};
    const saved=await fetch(url+"/rest/v1/fiscal_cte_transmissions?id=eq."+auditId,{method:"PATCH",
     headers:{...dbHeaders,Prefer:"return=minimal"},
     body:JSON.stringify({provider_response:{...previous,cte_series_update:report}}),
     cache:"no-store",signal:AbortSignal.timeout(11000)});
    console.log("DOTCOMPANY_CTE_SERIE: "+report.reason+" audit="+saved.status);
   }
  }catch{console.log("DOTCOMPANY_CTE_SERIE: unable to save diagnostic");}
 }
}
await run();