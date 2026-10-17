/**
 * Reconcile official ANTT number into the DotCompany CT-e emitter.
 * Executes only in production during build, only for known Prime Group CNPJ,
 * and only if ANTT was verified and the provider field is still empty.
 * Does not change numbering, ICMS rates, tax CST, or transmit any document.
 */
const BASE="https://erp.dotcompany.com.br";
const URL=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const DBKEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
const CNPJ="42361401000117";
const EMITTER="646";
const ATTEMPT="717584a2-a3bd-4cd6-95d4-f4316e802665";
if(process.env.VERCEL_ENV!=="production"||!URL||!DBKEY||!TOKEN){
 console.log("DOTCOMPANY_RNTRC_SYNC: skipped (no production credentials)");
}else{
 const auth={Authorization:"Bearer "+TOKEN,Accept:"application/json"};
 const dbAuth={apikey:DBKEY,Authorization:"Bearer "+DBKEY,Accept:"application/json"};
 const json=async res=>{const s=await res.text();try{return JSON.parse(s)}catch{return {}}};
 const onlyDigits=x=>String(x??"").replace(/\D/g,"");
 const clean=x=>String(x??"").slice(0,350).replace(/dc_(?:live|test)_[A-Za-z0-9._-]+/g,"[REDACTED]");
 const result={checked_at:new Date().toISOString(),emitter:EMITTER,changed:false,reason:""};
 try{
  const transport=await fetch(URL+"/rest/v1/fiscal_transport_profiles?select=rntrc,rntrc_checked_at&limit=10",{
   headers:dbAuth,signal:AbortSignal.timeout(10000),cache:"no-store"});
  const rows=await json(transport);
  const verified=transport.ok&&Array.isArray(rows)?
   rows.filter(x=>x.rntrc_checked_at&&onlyDigits(x.rntrc)==="057592188"):[];
  if(verified.length!==1){result.reason="ANTT_PROFILE_NOT_UNIQUELY_VERIFIED";}
  else{
   const path="/api/v1/emitters/"+EMITTER+"/fiscal-profile";
   const read=await fetch(BASE+path,{headers:auth,cache:"no-store",signal:AbortSignal.timeout(12000)});
   const profile=await json(read);
   result.read_http=read.status;
   const owner=onlyDigits(profile.cnpj);
   const actual=onlyDigits(profile.perfil?.rntrc);
   result.before_present=!!actual;
   if(!read.ok){result.reason="EMITTER_PROFILE_UNAVAILABLE";}
   else if(owner!==CNPJ){result.reason="EMITTER_CNPJ_MISMATCH";}
   else if(actual===onlyDigits(verified[0].rntrc)){result.reason="RNTRC_ALREADY_CURRENT";}
   else if(actual){result.reason="PROVIDER_HAS_DIFFERENT_RNTRC";}
   else{
    const write=await fetch(BASE+path,{
     method:"PUT",
     headers:{...auth,"Content-Type":"application/json"},
     body:JSON.stringify({rntrc:onlyDigits(verified[0].rntrc)}),
     cache:"no-store",signal:AbortSignal.timeout(14000)});
    const response=await json(write);
    result.put_http=write.status;
    result.provider_code=clean(write.headers.get("x-error-code"));
    if(!write.ok){
     result.reason="EMITTER_UPDATE_FAILED";
     const msg=response?.message||response?.mensagem||response?.error;
     if(typeof msg==="string")result.message=clean(msg);
    }else{
     const verify=await fetch(BASE+path,{headers:auth,cache:"no-store",signal:AbortSignal.timeout(12000)});
     const after=await json(verify);
     result.verify_http=verify.status;
     result.changed=verify.ok&&onlyDigits(after.perfil?.rntrc)===onlyDigits(verified[0].rntrc);
     result.ready_cte=after.pronta_cte===true;
     result.ready_mdfe=after.pronta_mdfe===true;
     result.reason=result.changed?"RNTRC_CONFIRMED_IN_DOTCOMPANY":"PROVIDER_DID_NOT_CONFIRM_RNTRC";
    }
   }
  }
 }catch{result.reason="NETWORK_OR_PROVIDER_ERROR";}
 try{
  const got=await fetch(URL+"/rest/v1/fiscal_cte_transmissions?id=eq."+ATTEMPT+
    "&select=provider_response",{headers:dbAuth,cache:"no-store",signal:AbortSignal.timeout(10000)});
  const rows=await json(got);
  if(got.ok&&Array.isArray(rows)&&rows.length===1){
   const old=rows[0].provider_response&&typeof rows[0].provider_response==="object"?
    rows[0].provider_response:{};
   const saved=await fetch(URL+"/rest/v1/fiscal_cte_transmissions?id=eq."+ATTEMPT,{
    method:"PATCH",headers:{...dbAuth,"Content-Type":"application/json",Prefer:"return=minimal"},
    body:JSON.stringify({provider_response:{...old,emitter_rntrc_sync:result}}),
    cache:"no-store",signal:AbortSignal.timeout(10000)});
   console.log("DOTCOMPANY_RNTRC_SYNC: "+result.reason+" saved="+saved.status);
  }else console.log("DOTCOMPANY_RNTRC_SYNC: "+result.reason+" (no audit row)");
 }catch{console.log("DOTCOMPANY_RNTRC_SYNC: completed but audit unavailable");}
}
