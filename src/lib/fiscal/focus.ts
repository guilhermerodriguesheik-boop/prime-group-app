/** Focus NFe CT-e/MDF-e adapter. Server only: never pass tokens to browsers. */
export type FiscalKind = "cte" | "mdfe";
export type FiscalEnvironment = "homologacao" | "producao";
export type FiscalOperation = "emitir" | "consultar" | "cancelar" | "encerrar";
export type FiscalResult = { statusCode:number; data:Record<string,unknown> };
const BASES:Record<FiscalEnvironment,string>={
  homologacao:"https://homologacao.focusnfe.com.br",
  producao:"https://api.focusnfe.com.br",
};
export class FiscalProviderError extends Error {
  readonly statusCode:number;
  constructor(message:string,statusCode=502){super(message);this.name="FiscalProviderError";this.statusCode=statusCode;}
}
function tokenFor(environment:FiscalEnvironment):string{
  const value=environment==="producao" ? process.env.FOCUS_NFE_PRODUCTION_TOKEN : process.env.FOCUS_NFE_HOMOLOGATION_TOKEN;
  if(!value?.trim())throw new FiscalProviderError("Token Focus NFe indisponivel para "+environment+".",503);
  return value.trim();
}
export function fiscalIntegrationState(){
 return {
   provider:"focus_nfe",
   homologacao:Boolean(process.env.FOCUS_NFE_HOMOLOGATION_TOKEN?.trim()),
   producao:Boolean(process.env.FOCUS_NFE_PRODUCTION_TOKEN?.trim()),
 };
}
export function fiscalReference(kind:FiscalKind,draftId:string){
 if(!["cte","mdfe"].includes(kind)||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(draftId))
   throw new FiscalProviderError("Referencia fiscal invalida.",400);
 return "prime-"+kind+"-"+draftId.replaceAll("-","").toLowerCase();
}
function pathFor(kind:FiscalKind,operation:FiscalOperation,reference:string){
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(reference))throw new FiscalProviderError("Referencia invalida.",400);
 if(operation==="encerrar"&&kind!=="mdfe")throw new FiscalProviderError("Somente MDF-e pode ser encerrado.",400);
 return "/v2/"+kind+(operation==="emitir"?"":"/"+reference)+(operation==="encerrar"?"/encerrar":"");
}
function methodFor(operation:FiscalOperation){
 return operation==="emitir"||operation==="encerrar"?"POST":operation==="cancelar"?"DELETE":"GET";
}
export function validateFiscalPayload(kind:FiscalKind,payload:unknown,emitenteCnpj:string): Record<string,unknown> {
 if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new FiscalProviderError("Dados fiscais invalidos.",400);
 const value=payload as Record<string,unknown>;
 if(value.cnpj_emitente!==emitenteCnpj)throw new FiscalProviderError("CNPJ do emitente diverge da Prime Group.",400);
 if(kind==="cte"){
   if(!/^\d{4}$/.test(String(value.cfop??"")))throw new FiscalProviderError("CFOP do CT-e obrigatorio.",400);
   if(typeof value.natureza_operacao!=="string"||value.natureza_operacao.trim().length<3)
     throw new FiscalProviderError("Natureza de operacao do CT-e obrigatoria.",400);
   const total=Number(value.valor_total);
   if(!Number.isFinite(total)||total<=0)throw new FiscalProviderError("Valor do frete deve ser positivo.",400);
 }else{
   if(!value.veiculo_tracao||typeof value.veiculo_tracao!=="object")
     throw new FiscalProviderError("Veiculo tracao obrigatorio no MDF-e.",400);
 }
 return value;
}
export async function focusFiscalRequest(
 request:{kind:FiscalKind;environment:FiscalEnvironment;operation:FiscalOperation;reference:string;
          payload?:Record<string,unknown>; justification?:string;
          close?:{data:string;sigla_uf:string;nome_municipio:string}},
 fetcher:typeof fetch=fetch,
):Promise<FiscalResult>{
 const {kind,environment,operation,reference}=request;
 if(!(environment in BASES)||!["cte","mdfe"].includes(kind)||!["emitir","consultar","cancelar","encerrar"].includes(operation))
   throw new FiscalProviderError("Operacao fiscal nao reconhecida.",400);
 const token=tokenFor(environment);
 const path=pathFor(kind,operation,reference);
 const url=new URL(BASES[environment]+path);
 let body:Record<string,unknown>|undefined;
 if(operation==="emitir"){
   if(!request.payload)throw new FiscalProviderError("Dados da emissao obrigatorios.",400);
   url.searchParams.set("ref",reference);
   body=request.payload;
 } else if(operation==="cancelar") {
   if(!request.justification||request.justification.trim().length<15||request.justification.length>255)
     throw new FiscalProviderError("Justificativa de cancelamento entre 15 e 255 caracteres.",400);
   body={justificativa:request.justification.trim()};
 } else if(operation==="encerrar") {
   const close=request.close;
   if(!close||!/^\d{4}-\d{2}-\d{2}$/.test(close.data)||!/^([A-Z]{2})$/.test(close.sigla_uf)
       ||!close.nome_municipio.trim())throw new FiscalProviderError("Dados de encerramento invalidos.",400);
   body=close;
 }
 const response=await fetcher(url.toString(),{
   method:methodFor(operation),signal:AbortSignal.timeout(25000),
   headers:{"Accept":"application/json","Authorization":"Basic "+Buffer.from(token+":").toString("base64"),...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
   cache:"no-store",
 });
 const raw=await response.text();
 let data:Record<string,unknown>={};
 try { const parsed=JSON.parse(raw) as unknown; if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))data=parsed as Record<string,unknown>; }
 catch { data={mensagem:"Resposta fiscal nao-JSON."}; }
 if(!response.ok){
   const code=response.status;
   const reason=typeof data.mensagem==="string"?data.mensagem:
     typeof data.mensagem_sefaz==="string"?data.mensagem_sefaz:"Servico fiscal indisponivel.";
   throw new FiscalProviderError("Focus NFe HTTP "+code+": "+reason,code);
 }
 return {statusCode:response.status,data};
}
