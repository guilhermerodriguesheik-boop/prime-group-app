import test from "node:test";
import assert from "node:assert/strict";
import {firstBankButtons,extraBankButtons,bankButtonId,readBankButtonId} from "../src/lib/banks/interactive-bank-buttons.ts";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("three button options per message have unique transaction-message references",()=>{
 const first=firstBankButtons(id),second=extraBankButtons(id);
 assert.equal(first.length,3);assert.equal(second.length,3);
 assert.deepEqual([...first,...second].map(b=>b.displayText),
  ["Empresa","Pessoal","Mais opções","Empréstimos","Transferência","Pendente"]);
 assert.equal(new Set([...first,...second].map(b=>b.id)).size,6);
 assert.deepEqual(readBankButtonId(bankButtonId(id,"T")),{outboxId:id,action:"T"});
});
test("reject spoofed WhatsApp button identifiers",()=>{
 assert.equal(readBankButtonId("pb1.invalid.E"),null);
 assert.equal(readBankButtonId("pb1."+id+".X"),null);
 assert.equal(readBankButtonId("Empresa"),null);
 assert.equal(readBankButtonId({id:"Empresa"}),null);
 assert.throws(()=>bankButtonId("untrusted","E"));
});
