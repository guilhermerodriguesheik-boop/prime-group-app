import test from "node:test";
import assert from "node:assert/strict";
import {selectedFreightTotals,selectedDriverId,driverWhatsAppSummary,whatsappDraftLink} from "../src/lib/fiscal/selected-freights.ts";
const row=(cargo,driver="driver-a",pay=250,paid=false)=>({
 cargo,freight:1800,advance:900,received:0,pending:900,emailDate:"2026-10-17",
 operation:{service_date:"2026-10-16",route_description:"Rio - Niterói",driver_id:driver,
  driver_pay:pay,driver_paid:paid,helper_count:2,helper_rate:100,
  helpers_paid:false,diesel:50,tolls:10,other_expenses:0}
});
test("only chosen cargo totals are summed",()=>{
 const s=selectedFreightTotals([row("030061"),row("030151","driver-a",350,true)]);
 assert.equal(s.count,2);assert.equal(s.freight,3600);assert.equal(s.pending,1800);
 assert.equal(s.driverAgreed,600);assert.equal(s.driverDue,250);
 assert.equal(s.helpersDue,400);assert.equal(s.costs,1120);
 assert.equal(s.estimatedResult,2480);
});
test("driver messages include selected rows and agreed vs due, not customer freight totals",()=>{
 const summary=driverWhatsAppSummary([row("030061"),row("030151","driver-a",350,true)],"Motorista A");
 assert.ok(summary?.includes("Carga 030061"));
 assert.ok(summary?.includes("Carga 030151"));
 assert.ok(summary?.replace(/\u00a0/g," ").includes("Total a pagar: R$ 250,00"));
 assert.ok(summary?.replace(/\u00a0/g," ").includes("Total combinado: R$ 600,00"));
 assert.ok(!summary?.includes("R$ 3.600,00"));
 assert.ok(!summary?.includes("Diesel"));
});
test("do not mix drivers or send unknown driver pay",()=>{
 assert.equal(selectedDriverId([row("030061","d1"),row("030151","d2")]),null);
 assert.equal(driverWhatsAppSummary([row("030061","d1"),row("030151","d2")],"D1"),null);
 assert.equal(driverWhatsAppSummary([row("030061","d1",0)],"D1"),null);
});
test("WhatsApp phone normalizes Brazil numbers or opens recipient chooser",()=>{
 assert.ok(whatsappDraftLink("Teste","21988887777")?.startsWith("https://wa.me/5521988887777?text="));
 assert.ok(whatsappDraftLink("Teste","")?.startsWith("https://api.whatsapp.com/send?text="));
 assert.equal(whatsappDraftLink("Teste","123"),null);
});
