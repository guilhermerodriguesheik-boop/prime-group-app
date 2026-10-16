import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createRequire} from "node:module";
import ts from "typescript";
const nativeRequire=createRequire(import.meta.url);
const cache=new Map();
function loadTS(relative){
 const path=resolve(relative);
 if(cache.has(path))return cache.get(path);
 const mod={exports:{}};cache.set(path,mod.exports);
 const compiled=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const customRequire=(name)=>{
  if(name==="@/lib/fiscal/preflight")return loadTS("src/lib/fiscal/preflight.ts");
  if(name==="@/lib/fiscal/dotcompany")return loadTS("src/lib/fiscal/dotcompany.ts");
  return nativeRequire(name);
 };
 new Function("require","module","exports",compiled)(customRequire,mod,mod.exports);
 return mod.exports;
}
const {ctePreview,productionKey,safeConfig}=loadTS("src/lib/fiscal/cte-confirm.ts");
const draft={
 id:"e631c36a-bb3c-4b69-a8b8-8502be5dc051",
 cargo_reference:"030198",ciot:"123456789012",freight_value:3420,
 updated_at:"2026-10-15T20:00:00Z",status:"draft",vehicle_id:"v",driver_id:"d",
 checklist:{cte_provider_config:{
  cfop:"5352",tomador:"0",produto_predominante:"COLCHOES E CAMAS",
  uf_licenciamento:"RJ",numbering_verified:true,
 }},
};
const notes=[
 {access_key:"5".repeat(44),invoice_number:"22",origin_uf:"RJ",destination_uf:"RJ",goods_value:10000,gross_weight_kg:320},
 {access_key:"6".repeat(44),invoice_number:"23",origin_uf:"RJ",destination_uf:"RJ",goods_value:20000,gross_weight_kg:650},
];
const valid={
 draft,notes,driver:{id:"d",name:"MOTORISTA TESTE",document:"52998224725",active:true},
 vehicle:{id:"v",plate:"ABC1D23",nickname:"Caminhao",status:"active"},
 profile:{rntrc:"12345678",rntrc_checked_at:"2026-10-15T15:00:00Z"},
 configured:true,liveEnabled:true,existingSubmission:false,
};
test("Production token must be live, never sandbox",()=>{
 assert.equal(productionKey("dc_test_3."+"x".repeat(25)),false);
 assert.equal(productionKey(undefined),false);
 assert.equal(productionKey("dc_live_4."+"y".repeat(25)),true);
});
test("Review blocks SEFAZ without live configuration",()=>{
 const r=ctePreview({...valid,configured:false,liveEnabled:false});
 assert.equal(r.ready,false);
 assert.ok(r.missing.some(x=>x.includes("Produção")));
 assert.ok(r.missing.some(x=>x.includes("desabilitada")));
});
test("Review is ready only after valid fiscal and human data",()=>{
 const r=ctePreview(valid);
 assert.equal(r.ready,true,r.missing.join("\n"));
 assert.equal(r.payload.valor_frete,3420);
 assert.equal(r.payload.valor_carga,30000);
 assert.equal(r.payload.peso_bruto,970);
 assert.equal(r.payload.documentos.length,2);
 assert.equal(r.hash.length,64);
});
test("No duplicate transmission where external CT-e exists",()=>{
 const r=ctePreview({...valid,draft:{...draft,checklist:{...draft.checklist,do_not_issue_duplicate:true}}});
 assert.equal(r.ready,false);
 assert.ok(r.missing.some(x=>x.includes("CT-e emitido fora")));
});
test("Unverified RNTRC, missing driver and missing numbering block",()=>{
 const bad=ctePreview({...valid,driver:null,profile:{rntrc:"00000000",rntrc_checked_at:null},
  draft:{...draft,checklist:{cte_provider_config:{...draft.checklist.cte_provider_config,numbering_verified:false}}}});
 assert.equal(bad.ready,false);
 assert.ok(bad.missing.some(x=>x.includes("motorista")));
 assert.ok(bad.missing.some(x=>x.includes("RNTRC")));
 assert.ok(bad.missing.some(x=>x.includes("sequência fiscal")));
});
test("Stale hash invalidated by a change to freight or tax settings",()=>{
 const p=ctePreview(valid);
 assert.notEqual(p.hash,ctePreview({...valid,draft:{...draft,freight_value:3500}}).hash);
 assert.notEqual(p.hash,ctePreview({...valid,draft:{...draft,checklist:{cte_provider_config:{...draft.checklist.cte_provider_config,cfop:"6352"}}}}).hash);
});
test("Fiscal configuration sanitizes untrusted user entries",()=>{
 assert.deepEqual(safeConfig({cfop:"5352OVERFLOW",tomador:"012",produto_predominante:"TEST",uf_licenciamento:"rj",
  numbering_verified:"true"}),{cfop:"5352",tomador:"0",produto_predominante:"TEST",uf_licenciamento:"RJ",numbering_verified:false});
});

test("Reviewed CT-e template is reusable by route, but never reuses sending consent",()=>{
 const row={...valid,
  draft:{...draft,checklist:{}},
  profile:{...valid.profile,cte_defaults:{
   cfop:"5352",tomador:"0",produto_predominante:"COLCHOES E CAMAS",
   uf_licenciamento:"RJ",origin_uf:"RJ",destination_uf:"RJ",numbering_verified:true,
  }},
 };
 const res=ctePreview(row);
 assert.equal(res.config.cfop,"5352");
 assert.equal(res.config.produto_predominante,"COLCHOES E CAMAS");
 assert.equal(res.config.numbering_verified,false);
 assert.equal(res.ready,false);
 assert.ok(res.missing.some(x=>x.includes("sequência fiscal")));
 const other=ctePreview({...row,notes:[{...notes[0],destination_uf:"SP"}]});
 assert.equal(other.config.cfop,"");
 assert.equal(other.ready,false);
});
