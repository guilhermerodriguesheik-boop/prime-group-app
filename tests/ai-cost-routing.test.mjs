import assert from "node:assert/strict";
import test from "node:test";
import { chooseAiProfile, estimateAiCostUsd } from "../src/lib/ai/cost-routing.ts";

const env = {
  PRIME_AGENT_MODEL: "gpt-6-astra",  // legado de Vercel: deve ser ignorado no modo econômico
};
test("mensagens comuns usam Luna mesmo se o ambiente antigo selecionar Astra", () => {
  const result = chooseAiProfile({message:"gastei 150 no diesel do 12170",environment:env});
  assert.equal(result.model,"gpt-6-luna");
  assert.equal(result.tier,"economy");
  assert.equal(result.reasoningEffort,"none");
  assert.ok(result.maxOutputTokens < 8192);
});
test("juros, impostos e planejamento usam Sol com raciocinio adequado", () => {
  const financial = chooseAiProfile({message:"calcule juros e amortização do empréstimo",environment:env});
  assert.equal(financial.model,"gpt-6.1-sol");
  assert.equal(financial.reasoningEffort,"medium");
  const tax = chooseAiProfile({message:"Preciso conferir imposto do CT-e e tributação",environment:env});
  assert.equal(tax.model,"gpt-6.1-sol");
  assert.equal(tax.reasoningEffort,"medium");
  const planning=chooseAiProfile({message:"faça um planejamento de frota",environment:env});
  assert.equal(planning.model,"gpt-6.1-sol");
});
test("imagens e PDFs sempre usam modelo mais forte",()=>{
  assert.equal(chooseAiProfile({message:"leia",hasVisual:true,environment:env}).model,"gpt-6.1-sol");
  assert.equal(chooseAiProfile({message:"consulta",hasVisual:true,channel:"whatsapp",environment:env}).tier,"complex");
});
test("respostas do WhatsApp tem limite mais curto",()=>{
  const profile=chooseAiProfile({message:"paguei 100",channel:"whatsapp",environment:env});
  assert.equal(profile.model,"gpt-6-luna");
  assert.ok(profile.maxOutputTokens<=1400);
});
test("nomes de modelos podem ser sobrescritos intencionalmente sem expor segredos",()=>{
  const profile=chooseAiProfile({message:"saldo",environment:{PRIME_AI_ECONOMY_MODEL:"custom-cheap"}});
  assert.equal(profile.model,"custom-cheap");
});
test("estimativa de custo apenas para modelos tarifados conhecidos",()=>{
  assert.equal(estimateAiCostUsd("gpt-6-luna",{inputTokens:1000000,outputTokens:1000000}),0.6);
  assert.equal(estimateAiCostUsd("gpt-6.1-sol",{inputTokens:1000000,outputTokens:1000000}),12);
  assert.equal(estimateAiCostUsd("unknown",{inputTokens:100,outputTokens:100}),null);
  assert.equal(estimateAiCostUsd("gpt-6-luna",{inputTokens:-1,outputTokens:1}),null);
});
