import test from "node:test";
import assert from "node:assert/strict";
import {idempotencyKey,dotcompanyHealth,dotcompanyEmitSandbox,DotCompanyError,preflightCte,preflightMdfe,sandboxOnly} from "../src/lib/fiscal/dotcompany.ts";
const token="dc_test_999."+"a".repeat(45);
const validCte={
 uf_inicio:"RJ",uf_fim:"RJ",cfop:"5352",modal:"01",tomador:"0",
 produto_predominante:"COLCHOES",peso_bruto:234.8,valor_carga:5600,valor_frete:1800,
 documentos:[{chave_acesso:"3".repeat(44)}],
 veiculos:[{placa:"ABC1D23",uf_licenciamento:"RJ"}],
 motoristas:[{cpf:"12345678909",nome:"MOTORISTA TESTE"}],
};
const uuid="e631c36a-bb3c-4b69-a8b8-8502be5dc051";
test("DotCompany: only sandbox keys accepted",()=>{
 assert.equal(sandboxOnly(token),token);
 assert.throws(()=>sandboxOnly("dc_live_123.secret"),/SANDBOX_KEY_MISSING/);
 assert.throws(()=>sandboxOnly(undefined),/SANDBOX_KEY_MISSING/);
});
test("DotCompany: usage authentication uses GET Bearer without leaking token",async()=>{
 let captured;
 const mock=async (url,options)=>{captured={url,options};return new Response(JSON.stringify({saldo:{disponivel:50}}),{status:200})};
 const r=await dotcompanyHealth(token,mock);
 assert.equal(r.status,200);
 assert.equal(captured.url,"https://erp.dotcompany.com.br/api/v1/usage");
 assert.equal(captured.options.method,"GET");
 assert.equal(captured.options.headers.Authorization,"Bearer "+token);
});
test("DotCompany: 401/403 and 429 return explicit sanitized codes",async()=>{
 for(const [status,expected] of [[401,"INVALID_API_KEY"],[403,"INSUFFICIENT_API_SCOPE"],[429,"RATE_LIMIT"]]){
  await assert.rejects(dotcompanyHealth(token,async()=>new Response('{"secret":"never log"}',{status})),e=>e instanceof DotCompanyError&&e.code===expected);
 }
});
test("DotCompany: preflight requires actual vehicle/driver and note fields",()=>{
 assert.deepEqual(preflightCte(validCte),[]);
 assert.ok(preflightCte({...validCte,documentos:[]}).includes("NFE_KEYS_REQUIRED"));
 assert.ok(preflightCte({...validCte,motoristas:[]}).includes("DRIVER_REQUIRED"));
 assert.ok(preflightMdfe({uf_inicio:"RJ",uf_fim:"RJ",rntrc:"12345678",documentos:[],veiculos:[],condutores:[]}).length>=3);
});
test("DotCompany: same CT-e draft uses stable UUID and Idempotency-Key on POST",async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({autorizado:false,message:"Homologacao ficticia"}),{status:200})};
 const a=await dotcompanyEmitSandbox({kind:"cte",draftId:uuid,token,payload:validCte,fetcher});
 const b=await dotcompanyEmitSandbox({kind:"cte",draftId:uuid,token,payload:validCte,fetcher});
 assert.equal(a.data.autorizado,false);
 assert.equal(calls[0].url,"https://erp.dotcompany.com.br/api/v1/cte/criar-e-emitir");
 assert.equal(calls[0].options.headers["Idempotency-Key"],calls[1].options.headers["Idempotency-Key"]);
 assert.equal(JSON.parse(calls[0].options.body).idempotency_key,idempotencyKey(uuid,"cte"));
});
test("DotCompany: invalid CT-e does not reach the network",async()=>{
 let called=false;
 await assert.rejects(dotcompanyEmitSandbox({kind:"cte",draftId:uuid,token,payload:{},fetcher:async()=>{called=true;throw Error("unexpected")}}),e=>e.code?.startsWith("PRECHECK_"));
 assert.equal(called,false);
});
