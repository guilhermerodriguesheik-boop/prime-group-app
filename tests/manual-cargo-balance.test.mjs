import test from "node:test";import assert from "node:assert/strict";
import {applyManualBalanceReceipt} from "../src/lib/fiscal/manual-balance.ts";
const item={cargo:"030151",freight:1800,advance:900,received:0,pending:900,status:"Pendente"};
test("Full manual receipt sets balance paid, green and tagged as manual",()=>{
 const r=applyManualBalanceReceipt(item,{manual_settled_on:"2026-10-17",manual_settled_amount:900});
 assert.equal(r.received,900);assert.equal(r.pending,0);
 assert.equal(r.status,"Pago");assert.equal(r.paymentSource,"manual");
});
test("Partial manual receipt keeps outstanding balance",()=>{
 const r=applyManualBalanceReceipt(item,{manual_settled_on:"2026-10-17",manual_settled_amount:"300.00"});
 assert.equal(r.received,300);assert.equal(r.pending,600);assert.equal(r.status,"Pendente");
});
test("No manual receipt leaves original pending amount",()=>{
 const r=applyManualBalanceReceipt(item,null);
 assert.equal(r.pending,900);assert.equal(r.paymentSource,null);
});
test("Payment email takes precedence; no double posting",()=>{
 const r=applyManualBalanceReceipt({...item,received:900,pending:0,status:"Pago"},
 {manual_settled_on:"2026-10-17",manual_settled_amount:900});
 assert.equal(r.received,900);assert.equal(r.paymentSource,"email");
});
test("Manual sum never exceeds actual outstanding",()=>{
 const r=applyManualBalanceReceipt(item,{manual_settled_on:"2026-10-17",manual_settled_amount:1500});
 assert.equal(r.received,900);assert.equal(r.pending,0);
});
test("Without freight data a manual receipt cannot invent a paid amount",()=>{
 const r=applyManualBalanceReceipt({...item,freight:null,pending:null,status:"Sem valor"},
 {manual_settled_on:"2026-10-17",manual_settled_amount:1000});
 assert.equal(r.status,"Sem valor");assert.equal(r.pending,null);assert.equal(r.manualReceived,0);
});
