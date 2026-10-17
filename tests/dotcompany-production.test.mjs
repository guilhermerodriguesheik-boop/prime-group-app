import test from "node:test";
import assert from "node:assert/strict";
import {checkDotCompanyProduction,validProductionKey,checkPrimeEmitterReadiness} from "../src/lib/fiscal/dotcompany-production.ts";
const key="dc_live_123."+"a".repeat(36);
test("Production-only gate rejects a sandbox token",()=>{
 assert.equal(validProductionKey(undefined),false);
 assert.equal(validProductionKey("dc_test_123."+"a".repeat(36)),false);
 assert.equal(validProductionKey(key),true);
});
test("No key: no network calls and never live",async()=>{
 let calls=0;
 const result=await checkDotCompanyProduction(undefined,false,async()=>{calls++;throw Error("Unexpected");});
 assert.equal(calls,0);assert.equal(result.authenticated,false);assert.equal(result.productionEnabled,false);
});
test("Production auth uses read-only GET and never leaks token in result",async()=>{
 const logs=[];
 const mock=async(url,options)=>{logs.push({url,options});return new Response(JSON.stringify({private:"secret",saldo:{disponivel:20}}),{status:200})};
 const result=await checkDotCompanyProduction(key,false,mock);
 assert.equal(logs.length,2);
 assert.ok(logs.every(x=>x.options.method==="GET"));
 assert.equal(result.authenticated,true);
 assert.equal(result.emitterLookup,"ok");
 assert.equal(JSON.stringify(result).includes(key),false);
 assert.equal(logs[0].url,"https://erp.dotcompany.com.br/api/v1/usage");
 assert.equal(logs[1].url,"https://erp.dotcompany.com.br/api/v1/emitters");
});
test("A failed emitter permission check does not claim emitter ready",async()=>{
 let i=0;
 const mock=async()=>{i++;return new Response("{}",{status:i===1?200:403})};
 const result=await checkDotCompanyProduction(key,false,mock);
 assert.equal(result.authenticated,true);
 assert.equal(result.emitterLookup,"denied");
});
test("Invalid production credentials return a sanitized failure",async()=>{
 const result=await checkDotCompanyProduction(key,false,async()=>new Response("bad secret",{status:401}));
 assert.equal(result.authenticated,false);
 assert.equal(result.status,401);
 assert.equal(JSON.stringify(result).includes("bad secret"),false);
});

test("Production auth falls back to emitter.list when usage.report scope is absent",async()=>{
 let calls=0;
 const r=await checkDotCompanyProduction(key,false,async(url,opts)=>{
  calls++;assert.equal(opts.method,"GET");
  return new Response("{}",{status:calls===1?403:200});
 });
 assert.equal(r.authenticated,true);
 assert.equal(r.emitterLookup,"ok");
 assert.match(r.message,/usage.report/);
 assert.equal(r.productionEnabled,false);
});
test("Production check refuses to declare success if both free reads lack scope",async()=>{
 const r=await checkDotCompanyProduction(key,false,async()=>new Response("{}",{status:403}));
 assert.equal(r.authenticated,false);
 assert.equal(r.emitterLookup,"denied");
 assert.match(r.reason,/usage.report/);
});

test("401 on usage alone does not mean revoked if emitter.list authenticates",async()=>{
 let n=0;
 const result=await checkDotCompanyProduction(key,false,async()=>{
  n++;return new Response("{}",{status:n===1?401:200});
 });
 assert.equal(result.authenticated,true);assert.equal(result.emitterLookup,"ok");
});
test("Two independent 401s mean the live key is rejected by both endpoints",async()=>{
 const result=await checkDotCompanyProduction(key,false,async()=>new Response("{}",{status:401}));
 assert.equal(result.authenticated,false);assert.equal(result.status,401);
 assert.match(result.reason,/Ambos os endpoints/);
});

test("Provider fiscal readiness is false even if the live key works",async()=>{
 const calls=[];
 const fetcher=async(url,opts)=>{
  calls.push({url,method:opts.method});
  return new Response(JSON.stringify({cnpj:"42.361.401/0001-17",pronta_cte:false,pronta_mdfe:false,
   perfil:{rntrc:"",cte_cst_icms:""},numeracao:[{modelo:55,serie:1,proximo_numero:1}]}),{status:200});
 };
 const r=await checkPrimeEmitterReadiness(key,fetcher);
 assert.equal(r.verified,true);assert.equal(r.cteReady,false);assert.equal(r.mdfeReady,false);
 assert.equal(r.hasRntrc,false);assert.equal(r.numberingCteConfigured,false);
 assert.equal(calls.length,1);assert.equal(calls[0].method,"GET");
 assert.ok(!JSON.stringify(r).includes(key));
});
test("Provider CT-e readiness requires the actual emitter and CNPJ",async()=>{
 const wrong=await checkPrimeEmitterReadiness(key,async()=>new Response(
  JSON.stringify({cnpj:"00.000.000/0001-00",pronta_cte:true}),{status:200}));
 assert.equal(wrong.verified,false);assert.equal(wrong.cteReady,false);
 const right=await checkPrimeEmitterReadiness(key,async()=>new Response(
  JSON.stringify({cnpj:"42361401000117",pronta_cte:true,pronta_mdfe:true,
   perfil:{rntrc:"057592188",cte_cst_icms:"00"},numeracao:[{modelo:"57",serie:"3",proximo_numero:35}]}),
   {status:200}));
 assert.equal(right.verified,true);assert.equal(right.cteReady,true);assert.equal(right.mdfeReady,true);
 assert.equal(right.hasRntrc,true);assert.equal(right.numberingCteConfigured,true);
});
