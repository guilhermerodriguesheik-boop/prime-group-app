import test from "node:test";
import assert from "node:assert/strict";
import {checkDotCompanyProduction,validProductionKey} from "../src/lib/fiscal/dotcompany-production.ts";
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
