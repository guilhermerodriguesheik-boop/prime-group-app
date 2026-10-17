import test from "node:test";
import assert from "node:assert/strict";
import {buildCargoLedger} from "../src/lib/fiscal/simple-cargo-ledger.ts";
const record=(event_kind,lines,email_date="2026-10-16T15:00:00Z")=>({
 event_kind,email_date,ortobom_financial_lines:lines
});
const line=(cargo_reference,declared_freight,declared_advance,declared_balance=null)=>({
 cargo_reference,declared_freight,declared_advance,declared_balance
});
test("Duplicate advances are not double-counted; no period email means outstanding",()=>{
 const d=record("advance",[line("030151",1800,900)]);
 const [r]=buildCargoLedger([],[d,d]);
 assert.deepEqual(r,{cargo:"030151",freight:1800,advance:900,received:0,pending:900,status:"Pendente"});
});
test("Receipt confirmed by payment period email, even without bank statement",()=>{
 const advance=record("advance",[line("030061",1800,900)],"2026-10-14T15:00:00Z");
 const payment=record("period_payment",[line("30061",1800,900,900)]);
 const [r]=buildCargoLedger([],[advance,advance,payment,payment]);
 assert.deepEqual(r,{cargo:"030061",freight:1800,advance:900,received:900,pending:0,status:"Pago"});
});
test("Payment period with missing balance uses remaining freight and matches a cargo",()=>{
 const [r]=buildCargoLedger([],[record("advance",[line("28209",1190,595)]),
  record("period_payment",[line("028209",1190,null)])]);
 assert.deepEqual(r,{cargo:"028209",freight:1190,advance:595,received:595,pending:0,status:"Pago"});
});
test("Payment email for another cargo does not settle unrelated shipments",()=>{
 const list=buildCargoLedger(
  [{cargo_reference:"30151",freight_value:1800},{cargo_reference:"30061",freight_value:1800}],
  [record("advance",[line("30151",1800,900)]),
   record("period_payment",[line("30061",1800,900,900)])]);
 assert.equal(list.find(c=>c.cargo==="030151")?.pending,900);
 assert.equal(list.find(c=>c.cargo==="030061")?.pending,0);
});
test("Period payment email settles the cargo even with declared period discounts",()=>{
 const [r]=buildCargoLedger([],[record("period_payment",[line("29925",3420,1710,1200)])]);
 assert.equal(r.received,1200);assert.equal(r.pending,0);
 assert.equal(r.status,"Pago");
});
test("Full advance leaves no pending balance",()=>{
 const [r]=buildCargoLedger([],[record("advance",[line("31500",1800,1800)])]);
 assert.equal(r.advance,1800);assert.equal(r.pending,0);
 assert.equal(r.status,"Adiantado");
});
test("Period email records previously pending loads as paid without bank reconciliation",()=>{
 const drafts=[{cargo_reference:"030061",freight_value:1800},
  {cargo_reference:"029925",freight_value:3420},
  {cargo_reference:"030151",freight_value:1800}];
 const advance=record("advance",[line("30151",1800,900),line("30061",1800,900),
  line("29925",3420,1710)],"2026-10-08T12:23:31Z");
 const payment=record("period_payment",[line("30061",1800,900,900),
  line("29925",3420,1710,1710)],"2026-10-16T19:28:19Z");
 const rows=buildCargoLedger(drafts,[advance,payment]);
 assert.equal(rows.find(x=>x.cargo==="030061")?.status,"Pago");
 assert.equal(rows.find(x=>x.cargo==="029925")?.status,"Pago");
 assert.equal(rows.find(x=>x.cargo==="030151")?.status,"Pendente");
});
test("No cargo or freight reference does not create an invented paid amount",()=>{
 const d=buildCargoLedger([],[record("period_payment",[line("not a cargo",1190,595,595)])]);
 assert.deepEqual(d,[]);
 const [r]=buildCargoLedger([],[record("period_payment",[line("29988",null,595,null)])]);
 assert.equal(r.pending,null);assert.equal(r.status,"Sem valor");
});
