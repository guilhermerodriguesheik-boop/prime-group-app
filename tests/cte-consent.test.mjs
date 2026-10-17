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
  if(name==="@/lib/fiscal/cte-compliance")return loadTS("src/lib/fiscal/cte-compliance.ts");
  if(name==="@/lib/fiscal/cte-autofill")return loadTS("src/lib/fiscal/cte-autofill.ts");
  return nativeRequire(name);
 };
 new Function("require","module","exports",compiled)(customRequire,mod,mod.exports);
 return mod.exports;
}
const {ctePreview,productionKey,safeConfig}=loadTS("src/lib/fiscal/cte-confirm.ts");
const {emptyCteCompliance,cteComplianceIssues,safeCteCompliance}=loadTS("src/lib/fiscal/cte-compliance.ts");
const verifiedDocuments={
 nfe_status:"consulta_oficial",nfe_consulta_ref:"protocolo SEFAZ consultado",
 crt:"1",cst_icms:"90",tributacao_conferida:true,
 municipio_inicio_ibge:"3304144",municipio_fim_ibge:"3304557",
 antt_review:"conferido",antt_referencia:"ANTT consultada",
 ciot_aplicabilidade:"obrigatorio",ciot_conferido:true,ciot_justificativa:"",
 crlv_status:"conferido",crlv_exercicio:"2026",
 cnh_status:"conferido",cnh_categoria:"D",cnh_validade:"2099-01-31",
};
const draft={
 id:"e631c36a-bb3c-4b69-a8b8-8502be5dc051",
 cargo_reference:"030198",ciot:"123456789012",freight_value:3420,
 updated_at:"2026-10-15T20:00:00Z",status:"draft",vehicle_id:"v",driver_id:"d",
 checklist:{cte_provider_config:{
  cfop:"5352",tomador:"0",produto_predominante:"COLCHOES E CAMAS",
  uf_licenciamento:"RJ",numbering_verified:true,compliance:verifiedDocuments,
 }},
};
const sampleXml='<NFe><enderEmit><cMun>3304144</cMun></enderEmit><enderDest><cMun>3302205</cMun></enderDest>'+
 '<protNFe><infProt><cStat>100</cStat><nProt>333260123456789</nProt></infProt></protNFe></NFe>';
const notes=[
 {access_key:"5".repeat(44),invoice_number:"22",origin_uf:"RJ",destination_uf:"RJ",goods_value:10000,gross_weight_kg:320,xml_content:sampleXml},
 {access_key:"6".repeat(44),invoice_number:"23",origin_uf:"RJ",destination_uf:"RJ",goods_value:20000,gross_weight_kg:650,xml_content:sampleXml},
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
  numbering_verified:"true"}),{cfop:"5352",tomador:"0",produto_predominante:"TEST",uf_licenciamento:"RJ",numbering_verified:false,compliance:emptyCteCompliance});
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

const {definitiveCteRejection,correctionFromProvider}=loadTS("src/lib/fiscal/cte-recovery.ts");
test("Missing people ids is an explicit pre-SEFAZ rejection and may be corrected",()=>{
 const provider={message:"Faltam campos obrigatórios: remetente_id e destinatario_id"};
 assert.equal(definitiveCteRejection(422,provider),true);
 assert.equal(definitiveCteRejection(500,provider),false);
 assert.equal(definitiveCteRejection(422,{message:"Problema desconhecido"}),false);
 assert.equal(definitiveCteRejection(422,{...provider,chave_acesso:"1".repeat(44)}),false);
 const description=correctionFromProvider("rejected","HTTP_422",{...provider,definitive_rejection:true});
 assert.equal(description.retryPossible,true);
 assert.equal(description.action,"cadastros");
});
test("Definitive rejection can be corrected but an indeterminate operation stays blocked",()=>{
 const mayRetry=ctePreview({...valid,existingSubmission:true,retryAllowed:true});
 assert.equal(mayRetry.ready,true);
 assert.equal(mayRetry.retryAllowed,true);
 const unknown=ctePreview({...valid,existingSubmission:true,retryAllowed:false});
 assert.equal(unknown.ready,false);
 assert.ok(unknown.missing.some(x=>x.includes("Já existe uma tentativa")));
});
test("Server rejection without SEFAZ response must not permit a fiscal retry",()=>{
 assert.equal(definitiveCteRejection(422,{message:"Autorizador não respondeu"}),false);
 assert.equal(definitiveCteRejection(200,{autorizado:false,codigo_status_sefaz:"539"}),true);
 assert.equal(definitiveCteRejection(200,{autorizado:false}),false);
});

test("Auto fills XML cities and protocol without inventing current SEFAZ consultation",()=>{
 const input={...valid,draft:{...draft,checklist:{cte_provider_config:{
  ...draft.checklist.cte_provider_config,compliance:emptyCteCompliance
 }}}};
 const p=ctePreview(input);
 assert.equal(p.config.compliance.municipio_inicio_ibge,"3304144");
 assert.equal(p.config.compliance.municipio_fim_ibge,"3302205");
 assert.equal(p.config.compliance.nfe_status,"xml_autorizado");
 assert.ok(p.config.compliance.nfe_consulta_ref.includes("cStat 100"));
 assert.ok(p.config.compliance.antt_referencia.includes("2026-10-15"));
 assert.equal(p.config.compliance.ciot_aplicabilidade,"informado");
 assert.equal(p.ready,true,p.missing.join("\n"));
 assert.ok(!p.config.compliance.tributacao_conferida);
});
test("Without XML city the app warns but does not invent a municipality code",()=>{
 const lacking=ctePreview({...valid,notes:[{...notes[0],xml_content:null}],
  draft:{...draft,checklist:{cte_provider_config:{
   ...draft.checklist.cte_provider_config,compliance:emptyCteCompliance
  }}}});
 assert.equal(lacking.ready,false);
 assert.ok(lacking.missing.some(t=>t.includes("Código IBGE")));
 assert.equal(lacking.config.compliance.nfe_status,"pendente");
});
test("CIOT exemption needs explicit justification and does not silently assume validity",()=>{
 const waived={...verifiedDocuments,ciot_aplicabilidade:"dispensado",ciot_conferido:false,ciot_justificativa:""};
 assert.ok(cteComplianceIssues(waived,null).some(x=>x.includes("CIOT")));
 assert.equal(cteComplianceIssues({...waived,ciot_justificativa:"Dispensa revisada conforme operação e lei vigente"},null).some(x=>x.includes("CIOT")),false);
});
test("Additional compliance entries are sanitized before storage",()=>{
 const c=safeCteCompliance({...verifiedDocuments,municipio_inicio_ibge:"<script>3304144",crt:"invalid",nfe_status:"automaticamente validada"});
 assert.equal(c.municipio_inicio_ibge,"3304144");
 assert.equal(c.crt,"");
 assert.equal(c.nfe_status,"pendente");
});

test("An imported CIOT is not mislabeled as verified in official source",()=>{
 const {prefillCteCompliance}=loadTS("src/lib/fiscal/cte-autofill.ts");
 const result=prefillCteCompliance({current:emptyCteCompliance,notes,
  transport:{ciot:"520037581133",rntrc_checked_at:"2026-10-16T02:31:52Z",tax_crt:"1"}});
 assert.equal(result.compliance.ciot_aplicabilidade,"informado");
 assert.equal(result.compliance.ciot_conferido,false);
 assert.equal(result.compliance.crt,"1");
 assert.equal(result.compliance.tributacao_conferida,false);
});
