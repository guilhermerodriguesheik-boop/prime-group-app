import test from "node:test";
import assert from "node:assert/strict";
import {checkAnttSnapshot} from "../src/lib/fiscal/antt-snapshot.ts";
const api=rs=>new Response(JSON.stringify({success:true,result:{records:rs}}),{status:200});
test("official snapshot validates RNTRC and company together",async()=>{
 const x=await checkAnttSnapshot("057592188","42361401000117",
  async()=>api([{numero_rntrc:57592188,cpfcnpjtransportador:"42361401000117",
   nome_transportador:"Prime Group",situacao_rntrc:"ATIVO"}]));
 assert.equal(x.matched,true);assert.equal(x.status,"ATIVO");assert.equal(x.period,"2026-09");
});
test("other company does not verify the record",async()=>{
 const x=await checkAnttSnapshot("057592188","42361401000117",
  async()=>api([{numero_rntrc:57592188,cpfcnpjtransportador:"99999999000199",situacao_rntrc:"ATIVO"}]));
 assert.equal(x.matched,false);
});
test("unavailable source never implies active RNTRC",async()=>{
 const x=await checkAnttSnapshot("057592188","42361401000117",
  async()=>new Response("fail",{status:502}));
 assert.equal(x.matched,false);assert.equal(x.checked,false);
});
test("snapshot lookup is GET-only and limited",async()=>{
 let url,method;
 await checkAnttSnapshot("057592188","42361401000117",async(u,args)=>{
  url=u;method=args.method;return api([]);
 });
 assert.equal(method,"GET");
 assert.equal(new URL(url).searchParams.get("limit"),"10");
});
