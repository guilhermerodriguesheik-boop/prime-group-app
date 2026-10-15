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
 let res:Response;
 try{res=await fetchUrl(PATHS[0]);}
 catch{return {...base,emitterLookup:"unavailable",reason:"Falha de rede ao consultar a DotCompany."};}
 if(!res.ok){
  return {...base,status:res.status,reason:res.status===401?"Chave de produção inválida ou revogada.":
   res.status===403?"Permissão insuficiente na chave de produção.":"A autenticação da DotCompany respondeu com erro."};
 }
 // Never expose credits, company or token from provider JSON in this diagnostic.
 try{
  const emitters=await fetchUrl(PATHS[1]);
  return {...base,authenticated:true,status:res.status,
   emitterLookup:emitters.ok?"ok":emitters.status===401||emitters.status===403?"denied":"unavailable",
   message:emitters.ok?
    "API de produção autenticada e endpoint de emissores acessível. Isso não garante credenciamento ou autorização na SEFAZ.":
    "API de produção autenticada. Confirme as permissões e a situação do emissor no painel DotCompany."};
 }catch{
  return {...base,authenticated:true,status:res.status,emitterLookup:"unavailable",
   message:"API de produção autenticada, porém a consulta de emissores não respondeu."};
 }
}
