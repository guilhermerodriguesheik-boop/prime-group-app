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
 if(usage.status===401)return {...base,status:401,reason:"Chave de produção inválida ou revogada."};
 // A DotCompany authorizes usage.report and emitter.list independently.
 // If usage.report is disabled, listing emitters is still a safe read-only handshake.
 if(!usage.ok&&usage.status!==403)return {...base,status:usage.status,
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
  reason:emitters.status===401?
   "Credencial rejeitada pela listagem de emissores.":
   "Esta chave não tem permissão para consultar consumo (usage.report) nem listar emissores (emitter.list)."};

}
