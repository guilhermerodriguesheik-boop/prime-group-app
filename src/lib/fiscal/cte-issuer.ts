import "server-only";
/** Read issuer values without exposing provider credentials or treating
 * tax classifications as verified for a particular trip.
 */
export type IssuerCteNumbering={series:string;nextNumber:number};
export type IssuerTaxDefaults={crt?:string;cst_icms?:string;cteNumbering?:IssuerCteNumbering};
/** Read-only provider evidence; no number mutation or SEFAZ transmission. */
export async function issuerTaxDefaults():Promise<IssuerTaxDefaults>{
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
  const cteRows=(Array.isArray(data.numeracao)?data.numeracao:[])
   .filter((row:unknown)=>!!row&&typeof row==="object"&&!Array.isArray(row)&&
     String((row as Record<string,unknown>).modelo)==="57");
  const row=cteRows.length===1?cteRows[0] as Record<string,unknown>:null;
  const series=String(row?.serie??"").replace(/^0+(?=\d)/,"");
  const next=Number(row?.proximo_numero);
  const cteNumbering=row&&/^\d{1,3}$/.test(series)&&Number.isSafeInteger(next)&&next>=1
    ?{series,nextNumber:next}:undefined;
  return {
   ...(cteNumbering?{cteNumbering}:{}),
   ...( /^[123]$/.test(crt)?{crt}:{}),
   ...( /^(00|20|40|41|50|51|60|90)$/.test(cst)?{cst_icms:cst}:{})
  };
 }catch{return {};}
}
