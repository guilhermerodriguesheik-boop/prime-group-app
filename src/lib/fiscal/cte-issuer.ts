import "server-only";
/** Read issuer values without exposing provider credentials or treating
 * tax classifications as verified for a particular trip.
 */
export async function issuerTaxDefaults():Promise<{crt?:string;cst_icms?:string}>{
 const token=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
 if(!token||!/^dc_live_[A-Za-z0-9._-]{16,}$/.test(token))return {};
 try{
  const response=await fetch("https://erp.dotcompany.com.br/api/v1/emitters/646/fiscal-profile",{
   headers:{Authorization:"Bearer "+token,Accept:"application/json"},cache:"no-store",
   signal:AbortSignal.timeout(7500)});
  if(!response.ok)return {};
  const data=await response.json() as Record<string,unknown>;
  if(String(data.cnpj||"").replace(/\D/g,"")!=="42361401000117")return {};
  const p=data.perfil&&typeof data.perfil==="object"&&!Array.isArray(data.perfil)
   ?data.perfil as Record<string,unknown>:{};
  const regime=String(p.regime_tributario??data.regime_tributario??"");
  const literalCrt=String(p.crt??data.crt??"");
  const crt=/^[123]$/.test(literalCrt)?literalCrt:
   /simples nacional/i.test(regime)?/excesso/i.test(regime)?"2":"1":
   /regime normal|lucro (presumido|real)/i.test(regime)?"3":"";
  const cst=String(p.cte_cst_icms??"");
  return {
   ...( /^[123]$/.test(crt)?{crt}:{}),
   ...( /^(00|20|40|41|50|51|60|90)$/.test(cst)?{cst_icms:cst}:{})
  };
 }catch{return {};}
}
