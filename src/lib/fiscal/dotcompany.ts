/** DotCompany fiscal provider: strictly sandbox in this phase. No production emission path.
 * https://erp.dotcompany.com.br/api/v1 — Official transport quickstart.
 */
import {createHash} from "node:crypto";
export type TransportKind="cte"|"mdfe";
export type TransportOperation="emit"|"cancel"|"document"|"consult"|"close"|"pending";
export type ApiData=Record<string,unknown>;
export const DOTCOMPANY_URL="https://erp.dotcompany.com.br";
export class DotCompanyError extends Error{
 readonly code:string;
 readonly status:number;
 constructor(code:string,status=502){super(code);this.name="DotCompanyError";this.code=code;this.status=status;}
}
export function sandboxConfigured(token:string|undefined):boolean{
 return Boolean(token&&/^dc_test_[A-Za-z0-9._-]{16,}$/.test(token));
}
export function sandboxOnly(token:string|undefined):string{
 if(!sandboxConfigured(token))throw new DotCompanyError("SANDBOX_KEY_MISSING",503);
 return token as string;
}
/** A stable UUIDv5-like key for a single draft and operation; retries reuse it. */
export function idempotencyKey(draftId:string,kind:TransportKind):string{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draftId))
  throw new DotCompanyError("INVALID_DRAFT_ID",400);
 const h=createHash("sha256").update("prime-fiscal/sandbox/"+kind+"/"+draftId.toLowerCase()).digest();
 h[6]=(h[6]&15)|80;h[8]=(h[8]&63)|128;
 const x=h.subarray(0,16).toString("hex");
 return x.slice(0,8)+"-"+x.slice(8,12)+"-"+x.slice(12,16)+"-"+x.slice(16,20)+"-"+x.slice(20);
}
function isRecord(value:unknown):value is ApiData{
 return !!value&&typeof value==="object"&&!Array.isArray(value);
}
export function preflightCte(data:unknown):string[]{
 const errors:string[]=[];
 if(!isRecord(data))return ["PAYLOAD_REQUIRED"];
 const uf=(v:unknown)=>typeof v==="string"&&/^[A-Z]{2}$/.test(v);
 if(!uf(data.uf_inicio)||!uf(data.uf_fim))errors.push("UF_REQUIRED");
 if(typeof data.cfop!=="string"||!/^[0-9]{4}$/.test(data.cfop))errors.push("CFOP_REQUIRED");
 if(!["01","1"].includes(String(data.modal??"")))errors.push("MODAL_REQUIRED");
 if(!["0","1","2","3","4"].includes(String(data.tomador??"")))errors.push("TOMADOR_REQUIRED");
 if(typeof data.produto_predominante!=="string"||data.produto_predominante.trim().length<3)errors.push("PRODUCT_REQUIRED");
 for(const field of ["peso_bruto","valor_carga","valor_frete"]){
  if(typeof data[field]!=="number"||!Number.isFinite(data[field])||Number(data[field])<=0)errors.push("INVALID_"+field.toUpperCase());
 }
 if(!Array.isArray(data.documentos)||!data.documentos.length||!data.documentos.every(v=>isRecord(v)&&/^[0-9]{44}$/.test(String(v.chave_acesso??""))))
  errors.push("NFE_KEYS_REQUIRED");
 if(!Array.isArray(data.veiculos)||!data.veiculos.length||!data.veiculos.every(v=>isRecord(v)&&/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(String(v.placa??""))&&uf(v.uf_licenciamento)))
  errors.push("VEHICLE_REQUIRED");
 if(!Array.isArray(data.motoristas)||!data.motoristas.length||!data.motoristas.every(v=>isRecord(v)&&/^[0-9]{11}$/.test(String(v.cpf??""))&&String(v.nome??"").trim().length>=4))
  errors.push("DRIVER_REQUIRED");
 return errors;
}
export function preflightMdfe(data:unknown):string[]{
 if(!isRecord(data))return ["PAYLOAD_REQUIRED"];
 const errs:string[]=[];
 if(!/^[A-Z]{2}$/.test(String(data.uf_inicio??""))||!/^[A-Z]{2}$/.test(String(data.uf_fim??"")))errs.push("UF_REQUIRED");
 if(!/^[0-9]{8,9}$/.test(String(data.rntrc??"")))errs.push("RNTRC_REQUIRED");
 if(!Array.isArray(data.documentos)||!data.documentos.length||!data.documentos.every(v=>isRecord(v)&&/^[0-9]{44}$/.test(String(v.chave_documento??""))))
  errs.push("CTE_KEY_REQUIRED");
 if(!Array.isArray(data.veiculos)||!data.veiculos.length||!data.veiculos.every(v=>isRecord(v)&&/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(String(v.placa??""))))errs.push("VEHICLE_REQUIRED");
 if(!Array.isArray(data.condutores)||!data.condutores.length||!data.condutores.every(v=>isRecord(v)&&/^[0-9]{11}$/.test(String(v.cpf??""))&&String(v.nome??"").trim().length>=4))errs.push("DRIVER_REQUIRED");
 return errs;
}
const ROUTES:Record<TransportKind,Record<TransportOperation,string>>={
 cte:{emit:"/api/v1/cte/criar-e-emitir",cancel:"/api/v1/cte/cancelar",consult:"/api/v1/cte/consultar",document:"/api/v1/cte/documento",close:"",pending:""},
 mdfe:{emit:"/api/v1/mdfe/criar-e-emitir",cancel:"/api/v1/mdfe/cancelar",consult:"/api/v1/mdfe/consultar",document:"/api/v1/mdfe/documento",close:"/api/v1/mdfe/encerrar",pending:"/api/v1/mdfe/pendentes-encerramento"},
};
function safeFailure(code:number):string{
 if(code===401)return "INVALID_API_KEY";
 if(code===403)return "INSUFFICIENT_API_SCOPE";
 if(code===402)return "INSUFFICIENT_CREDITS";
 if(code===429)return "RATE_LIMIT";
 if(code===400||code===422)return "INVALID_FISCAL_PAYLOAD";
 if(code>=500)return "PROVIDER_UNAVAILABLE";
 return "PROVIDER_HTTP_"+code;
}
export async function dotcompanyRequest(args:{
 token:string|undefined;path:string;method?:"GET"|"POST";
 body?:ApiData;idempotency?:string;fetcher?:typeof fetch;
}):Promise<{status:number;data:ApiData}>{
 const token=sandboxOnly(args.token);
 const allowGet=new Set(["/api/v1/usage","/api/v1/emitters"]);
 const allowPost=new Set(Object.values(ROUTES).flatMap(o=>Object.values(o)).filter(Boolean));
 if(args.method==="POST"?!allowPost.has(args.path):!allowGet.has(args.path))throw new DotCompanyError("ENDPOINT_NOT_ALLOWED",400);
 if(args.method==="POST"&&!args.idempotency)throw new DotCompanyError("IDEMPOTENCY_REQUIRED",400);
 if(args.idempotency&&!/^[0-9a-f-]{36}$/i.test(args.idempotency))throw new DotCompanyError("INVALID_IDEMPOTENCY",400);
 const response=await (args.fetcher||fetch)(DOTCOMPANY_URL+args.path,{
  method:args.method||"GET",
  headers:{"Authorization":"Bearer "+token,"Accept":"application/json",
   ...(args.body?{"Content-Type":"application/json"}:{}),
   ...(args.idempotency?{"Idempotency-Key":args.idempotency}:{})},
  ...(args.body?{body:JSON.stringify(args.body)}:{}),
  cache:"no-store",signal:AbortSignal.timeout(15000),
 });
 const text=await response.text();
 let parsed:unknown;
 try{parsed=JSON.parse(text)}catch{parsed=null}
 if(!response.ok)throw new DotCompanyError(safeFailure(response.status),response.status);
 return {status:response.status,data:isRecord(parsed)?parsed:{}};
}
export async function dotcompanyHealth(token:string|undefined,fetcher:typeof fetch=fetch){
 return dotcompanyRequest({token,path:"/api/v1/usage",fetcher});
}
export async function dotcompanyEmitSandbox(input:{
 kind:TransportKind;draftId:string;token:string|undefined;payload:ApiData;fetcher?:typeof fetch;
}){
 const issues=input.kind==="cte"?preflightCte(input.payload):preflightMdfe(input.payload);
 if(issues.length)throw new DotCompanyError("PRECHECK_"+issues.join("_"),422);
 const idempotency=idempotencyKey(input.draftId,input.kind);
 return dotcompanyRequest({token:input.token,path:ROUTES[input.kind].emit,method:"POST",
  body:{...input.payload,idempotency_key:idempotency},idempotency,fetcher:input.fetcher});
}
/** An adapter only; production writes remain disabled until emitter onboarding and SEFAZ tests. */
