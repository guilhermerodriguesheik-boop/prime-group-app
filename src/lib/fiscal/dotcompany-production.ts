/** Read-only production handshake. No SEFAZ transmission and no secret exposure. */
export type ProductionCheck={
 configured:boolean;authenticated:boolean;
 emitterLookup:"ok"|"denied"|"unavailable"|"not_checked";
 productionEnabled:boolean;status?:number;reason?:string;message?:string;
};
const BASE="https://erp.dotcompany.com.br";
const PATHS=["/api/v1/usage","/api/v1/emitters"] as const;
export function validProductionKey(raw:string|undefined):boolean{
 return !!raw&&/^dc_live_[A-Za-z0-9._-]{16,}$/.test(raw);
}
export async function checkDotCompanyProduction(
 raw:string|undefined,enabled:boolean,fetcher:typeof fetch=fetch
):Promise<ProductionCheck>{
 const base={configured:validProductionKey(raw),authenticated:false,
  emitterLookup:"not_checked" as const,productionEnabled:enabled};
 if(!base.configured)return {...base,reason:"A chave dc_live_ ainda não está na Vercel.",
  message:"Crie uma chave de produção no painel DotCompany com permissões cte:emit e mdfe:emit."};
 const fetchUrl=async(path:typeof PATHS[number])=>{
  // GET only, never perform an emission, mutation or status-event POST.
  return fetcher(BASE+path,{
   method:"GET",headers:{Authorization:"Bearer "+raw,Accept:"application/json"},
   cache:"no-store",signal:AbortSignal.timeout(12000),
  });
 };
 let usage:Response;
 try{usage=await fetchUrl(PATHS[0]);}
 catch{return {...base,emitterLookup:"unavailable",reason:"Falha de rede ao consultar a DotCompany."};}
 // Check two independent scopes before concluding the production token is revoked.
 // Provider may return 401 for a missing usage permission.

 // A DotCompany authorizes usage.report and emitter.list independently.
 // If usage.report is disabled, listing emitters is still a safe read-only handshake.
 if(!usage.ok&&usage.status!==401&&usage.status!==403)return {...base,status:usage.status,
  reason:"A consulta à DotCompany retornou HTTP "+usage.status+"."};
 let emitters:Response;
 try{emitters=await fetchUrl(PATHS[1]);}
 catch{
  return {...base,authenticated:usage.ok,status:usage.status,emitterLookup:"unavailable",
   reason:usage.ok?undefined:"Consulta de consumo sem permissão e listagem de emissores indisponível.",
   message:usage.ok?"API autenticada pelo consumo, mas o endpoint de emissores não respondeu.":undefined};
 }
 if(emitters.ok){
  return {...base,authenticated:true,status:emitters.status,emitterLookup:"ok",
   message:usage.ok?
    "API de produção autenticada e listagem de emissores acessível. O credenciamento fiscal ainda precisa ser validado.":
    "API de produção autenticada pela listagem de emissores. O endpoint de consumo exige o escopo usage.report."};
 }
 if(usage.ok){
  return {...base,authenticated:true,status:usage.status,
   emitterLookup:emitters.status===401||emitters.status===403?"denied":"unavailable",
   message:"API de produção autenticada pela consulta de consumo. A listagem de emissores está indisponível."};
 }
 return {...base,status:emitters.status,
  emitterLookup:emitters.status===401||emitters.status===403?"denied":"unavailable",
  reason:usage.status===401&&emitters.status===401?
   "Ambos os endpoints recusaram a chave de produção (HTTP 401). Confira a credencial na DotCompany.":
   emitters.status===401?
   "Credencial rejeitada pela listagem de emissores.":
   "Esta chave não tem permissão para consultar consumo (usage.report) nem listar emissores (emitter.list)."};

}

export type EmitterReadiness={
 verified:boolean;cteReady:boolean;mdfeReady:boolean;status:number|null;
 emitterId:string;hasRntrc:boolean;hasCteIcMSConfig:boolean;numberingCteConfigured:boolean;
 reason:string;
};
/**
 * A usable API key is NOT fiscal authorization. Check the actual Prime issuer.
 * No provider personal/certificate data is returned to clients.
 */
export async function checkPrimeEmitterReadiness(
 raw:string|undefined,fetcher:typeof fetch=fetch
):Promise<EmitterReadiness>{
 const base:EmitterReadiness={
  verified:false,cteReady:false,mdfeReady:false,status:null,
  emitterId:"646",hasRntrc:false,hasCteIcMSConfig:false,
  numberingCteConfigured:false,reason:"Prontidão fiscal do emissor não confirmada."
 };
 if(!validProductionKey(raw))return {...base,reason:"Chave de produção ausente ou inválida."};
 try{
  const response=await fetcher(BASE+"/api/v1/emitters/646/fiscal-profile",{
   method:"GET",headers:{Authorization:"Bearer "+raw,Accept:"application/json"},
   cache:"no-store",signal:AbortSignal.timeout(12000),
  });
  if(!response.ok)return {...base,status:response.status,
   reason:"DotCompany não permitiu consultar o perfil fiscal do emissor (HTTP "+response.status+")."};
  const received=await response.json() as unknown;
  const row=received&&typeof received==="object"&&!Array.isArray(received)
   ?received as Record<string,unknown>:{};
  if(String(row.cnpj||"").replace(/\D/g,"")!=="42361401000117")
   return {...base,status:response.status,
    reason:"CNPJ do emissor retornado pela DotCompany não corresponde à Prime Group."};
  const profile=row.perfil&&typeof row.perfil==="object"&&!Array.isArray(row.perfil)
   ?row.perfil as Record<string,unknown>:{};
  const numbering=Array.isArray(row.numeracao)?row.numeracao:[];
  const cteNumbering=numbering.some((n:unknown)=>{
   if(!n||typeof n!=="object"||Array.isArray(n))return false;
   const fields=n as Record<string,unknown>;
   return String(fields.modelo)==="57"&&String(fields.serie)==="3";
  });
  const validRntrc=/^[0-9]{8,9}$/.test(String(profile.rntrc||""));
  const icms=profile.cte_cst_icms!=null&&String(profile.cte_cst_icms).length>0;
  const cte=row.pronta_cte===true;
  const mdfe=row.pronta_mdfe===true;
  return {...base,verified:true,status:response.status,cteReady:cte,
   mdfeReady:mdfe,hasRntrc:validRntrc,hasCteIcMSConfig:icms,
   numberingCteConfigured:cteNumbering,
   reason:cte&&mdfe?"CT-e e MDF-e prontos conforme a DotCompany.":
    !cte?"DotCompany informa pronta_cte=false. O perfil de transporte precisa ser completado pelo emissor.":
     "CT-e pronto, mas DotCompany informa pronta_mdfe=false."};
 }catch{
  return {...base,reason:"Falha de comunicação ao consultar prontidão CT-e/MDF-e."};
 }
}
