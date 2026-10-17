import test from "node:test";
import assert from "node:assert/strict";
import {detectBankReportIntent as parse} from "../src/lib/banks/report-intent.ts";
test("AI can consult the bank statement and different periods",()=>{
 assert.deepEqual(parse("me mostra o extrato bancário de hoje"),{period:"today",sendWhatsApp:false});
 assert.deepEqual(parse("relatório bancário"),{period:"imported_today",sendWhatsApp:false});
 assert.deepEqual(parse("Quero as movimentações das contas da última semana"),{period:"last7",sendWhatsApp:false});
 assert.deepEqual(parse("extrato de ontem"),{period:"yesterday",sendWhatsApp:false});
 assert.deepEqual(parse("Me envia o relatorio bancario de ontem e hoje"),{period:"yesterday_today",sendWhatsApp:false});
 assert.deepEqual(parse("extrato de hoje e ontem"),{period:"yesterday_today",sendWhatsApp:false});
});
test("AI can send only on explicit request for WhatsApp",()=>{
 assert.deepEqual(parse("me manda o extrato bancário no whatsapp"),{period:"imported_today",sendWhatsApp:true});
 assert.deepEqual(parse("Envie o relatório financeiro no meu WhatsApp dos últimos 7 dias"),{period:"last7",sendWhatsApp:true});
 assert.equal(parse("cadastre uma conta a pagar"),null);
 assert.equal(parse("paguei 500 de diesel"),null);
});
test("WhatsApp report can be requested without service name",()=>{
 assert.deepEqual(parse("extrato"),{period:"imported_today",sendWhatsApp:false});
 assert.deepEqual(parse("relatório bancário de hoje"),{period:"today",sendWhatsApp:false});
});
