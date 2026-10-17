import test from "node:test";
import assert from "node:assert/strict";
import {parseWhatsAppBankNumber as classify} from "../src/lib/banks/whatsapp-classification.ts";
test("classifies the report's bank movement ordinal rather than an amount or fuzzy text",()=>{
 assert.deepEqual(classify("11 aplicação financeira"),{type:"classification",classification:{number:11,destination:"transfer",category:"aplicação financeira"}});
 assert.deepEqual(classify("classificar 10 tarifa bancária"),{type:"classification",classification:{number:10,destination:"prime",category:"tarifa bancária"}});
 assert.deepEqual(classify("5 pessoal mercado"),{type:"classification",classification:{number:5,destination:"personal",category:"mercado"}});
 assert.deepEqual(classify("classificar 2 empresa recebimento Ortobom"),{type:"classification",classification:{number:2,destination:"prime",category:"recebimento Ortobom"}});
 assert.deepEqual(classify("12 empréstimo"),{type:"classification",classification:{number:12,destination:"interest",category:"empréstimo"}});
 assert.deepEqual(classify("3 resgate de aplicação"),{type:"classification",classification:{number:3,destination:"transfer",category:"resgate de aplicação"}});
});
test("ambiguous categories ask for the area rather than silently changing the owner's books",()=>{
 assert.deepEqual(classify("8 mercado"),{type:"clarify",number:8,category:"mercado"});
 assert.equal(classify("11 ok"),null);
 assert.equal(classify("11 horas"),null);
 assert.equal(classify("pagar conta 11"),null);
 assert.equal(classify("200 tarifa bancaria"),null);
});
test("pending and account-only classification works",()=>{
 assert.deepEqual(classify("11 pendente"),{type:"classification",classification:{number:11,destination:"pending",category:""}});
 assert.deepEqual(classify("4 pessoal"),{type:"classification",classification:{number:4,destination:"personal",category:""}});
});
