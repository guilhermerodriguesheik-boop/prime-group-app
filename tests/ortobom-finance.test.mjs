import test from "node:test";
import assert from "node:assert/strict";
import {parseOrtobomFinancialEmail,canonicalCargo} from "../src/lib/fiscal/ortobom-finance-parser.ts";
test("Oct advance: retains freight and adiantamento per cargo",()=>{
 const d=parseOrtobomFinancialEmail("ADIANTAMENTO UNIDADE 27 - PRIME GROUP",
 "Bom dia\nADIANTAMENTO DE FRETE UNIDADE 27 – 08/10/26\nCARGA VLR DE FRETE ADTO\n30151 R$ 1.800,00 R$ 900,00\nAtt");
 assert.equal(d.kind,"advance");assert.equal(d.lines.length,1);
 assert.deepEqual(d.lines[0],{cargoReference:"30151",cteNumber:null,freight:1800,advance:900,balance:null});
});
test("Does not duplicate old adiantamento in quoted thread",()=>{
 const d=parseOrtobomFinancialEmail("ADIANTAMENTO UNIDADE 27 - PRIME GROUP",
 "29925 R$ 3.420,00 R$ 1.710,00\n\nDe: Acertorj.qm (acertorj.qm@ortobom.com.br)\n29758 R$ 2.115,00 R$ 1.057,50");
 assert.equal(d.lines.length,1);assert.equal(d.lines[0].cargoReference,"29925");
});
test("Period email: declared deposit != cargo settlement; preserve notinha separately",()=>{
 const d=parseOrtobomFinancialEmail("PAGAMENTO DE PERÍODO UNIDADE 27 - PRIME GROUP",
 "DATA DO PAGAMENTO: 09/10/26\nPERÍODO: 29/09/26 a 02/10/26\nVALOR DO DEPÓSITO BANCÁRIO: R$ 864,50\nNOTA PROMISSÓRIA: - R$ 193,00\nTRANSPORTADORA CTE CARGA FRETE ADIANTAMENTO SALDO\nPRIME GROUP 31 29758 R$ 2.115,00 R$ 1.057,50 R$ 1.057,50");
 assert.equal(d.paymentDate,"2026-10-09");assert.equal(d.declaredBankDeposit,864.50);
 assert.equal(d.declaredPromissoryDiscount,193);
 assert.deepEqual(d.lines[0],{cargoReference:"29758",cteNumber:"31",freight:2115,advance:1057.5,balance:1057.5});
});
test("Only primary email; no false freight from total result",()=>{
 const d=parseOrtobomFinancialEmail("PAGAMENTO DE PERÍODO UNIDADE 27 - PRIME GROUP",
 "CTE CARGA FRETE ADIANTAMENTO SALDO\n29 29603 R$ 1.800,00 R$ 900,00 R$ 900,00\nR$ 1.800,00 R$ 900,00 R$ 900,00");
 assert.equal(d.lines.length,1);assert.equal(d.lines[0].cargoReference,"29603");
});
test("Rejects other mail and malformed money",()=>{
 assert.equal(parseOrtobomFinancialEmail("Arquivos da carga 029988","29988 R$ 1190,00 R$ 595,00"),null);
 assert.equal(canonicalCargo("030061"),"30061");
 assert.equal(parseOrtobomFinancialEmail("ADIANTAMENTO UNIDADE 27","29988 R$ 1.190,00 R$ 9999,00"),null);
});
