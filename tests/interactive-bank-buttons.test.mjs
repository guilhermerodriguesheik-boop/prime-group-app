import test from "node:test";
import assert from "node:assert/strict";
import {firstBankButtons,extraBankButtons,bankButtonId,readBankButtonId,parseEvolutionBankButtonClick,readEvolutionGoBankReply} from "../src/lib/banks/interactive-bank-buttons.ts";
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

test("ButtonClick callback requires matching sender JID and interactive identifier",()=>{
 const input={buttonId:bankButtonId(id,"E"),phone:"5521999990000",
  jid:"5521999990000@s.whatsapp.net",messageId:"3EB01234567890",fromMe:false};
 assert.deepEqual(parseEvolutionBankButtonClick(input),{
  sender:"5521999990000",buttonId:input.buttonId,messageId:input.messageId,
  reference:{outboxId:id,action:"E"},
 });
 assert.equal(parseEvolutionBankButtonClick({...input,phone:"5521999990001"}),null);
 assert.equal(parseEvolutionBankButtonClick({...input,fromMe:true}),null);
 assert.equal(parseEvolutionBankButtonClick({...input,jid:"123@g.us"}),null);
 assert.equal(parseEvolutionBankButtonClick({...input,buttonId:"invalid"}),null);
});

test("Evolution Go v1 carousel template replies are real interactive messages",()=>{
 const reply={templateButtonReplyMessage:{
  selectedID:bankButtonId(id,"M"),selectedDisplayText:"Mais opções",
  contextInfo:{stanzaID:"3EB01234567890"}
 }};
 assert.equal(readEvolutionGoBankReply(reply),bankButtonId(id,"M"));
 assert.equal(readEvolutionGoBankReply({
  buttonsResponseMessage:{selectedButtonId:bankButtonId(id,"E")}
 }),bankButtonId(id,"E"));
 assert.equal(readEvolutionGoBankReply({conversation:bankButtonId(id,"P")}),null);
 assert.equal(readEvolutionGoBankReply({templateButtonReplyMessage:{selectedID:"unknown"}}),null);
 assert.equal(readEvolutionGoBankReply(null),null);
});
