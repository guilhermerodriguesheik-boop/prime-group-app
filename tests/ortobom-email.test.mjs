import test from "node:test";
import assert from "node:assert/strict";
import {parseOrtobomEmail,isOrtobomSender} from "../src/lib/fiscal/ortobom-email.ts";
test("Extrai CIOT e valor de frete sem usar valor da mercadoria",()=>{
 const parsed=parseOrtobomEmail("Fw: Arquivos da carga 030198.","R$ 3.420,00\n\nCIOT 20038706271\nDe: faturamentorj.qm@ortobom.com.br");
 assert.equal(parsed.cargoReference,"030198");
 assert.equal(parsed.freightValue,3420);
 assert.equal(parsed.ciot,"20038706271");
});
test("Nega dados ausentes",()=>{
 const parsed=parseOrtobomEmail("Mensagem desconhecida","Sem valor");
 assert.equal(parsed.freightValue,null);
 assert.equal(parsed.ciot,null);
});

test("Gmail não aceita falso remetente da Ortobom",()=>{
 assert.equal(isOrtobomSender('"Acerto" <acertorj.qm@ortobom.com.br>'),true);
 assert.equal(isOrtobomSender('<acertorj.qm@ortobom.com.br.attacker.net>'),false);
});
