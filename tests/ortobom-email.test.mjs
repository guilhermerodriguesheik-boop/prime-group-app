import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrtobomEmail, isOrtobomSender } from "../src/lib/fiscal/ortobom-email.ts";

test("carga Ortobom recebida por e-mail com valor e CIOT", () => {
  assert.deepEqual(parseOrtobomEmail(
    "Fw: Arquivos da carga 030198.",
    "R$ 3.420,00\n\nCIOT 20038706271\n\nSegue os arquivos.",
  ),{cargoReference:"30198",ciot:"20038706271",freightValue:3420});
});
test("outra carga, variante sem R$ antes do preço", () => {
  assert.deepEqual(parseOrtobomEmail(
    "Fw: Arquivos da carga 030151.",
    "1.800,00 CIOT 520037581133",
  ),{cargoReference:"30151",ciot:"520037581133",freightValue:1800});
});
test("nunca inventar frete ou CIOT quando e-mail estiver incompleto", () => {
  const result=parseOrtobomEmail("Fw: Arquivos da carga 029987.", "Segue XML anexo.");
  assert.equal(result.freightValue,null);
  assert.equal(result.ciot,null);
});
test("somente remetente do domínio permitido", () => {
  assert.equal(isOrtobomSender('"Acerto" <acertorj.qm@ortobom.com.br>'),true);
  assert.equal(isOrtobomSender('"Fraude" <acertorj.qm@ortobom.com.br.attacker.net>'),false);
});
