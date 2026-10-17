import test from "node:test";import assert from "node:assert/strict";
import {cargoCosts} from "../src/lib/fiscal/cargo-costs.ts";
test("motorista, dois ajudantes, diesel e pedagio",()=>{
 const c=cargoCosts({driver_pay:250,driver_paid:false,helper_count:2,helper_rate:150,helpers_paid:false,
 diesel:200,tolls:70,other_expenses:30},1800);
 assert.deepEqual(c,{driver:250,helpers:300,other:300,total:850,driverDue:250,helperDue:300,result:950});
});
test("despesas permanecem mesmo depois de marcar motorista pago",()=>{
 const c=cargoCosts({driver_pay:250,driver_paid:true,helper_count:2,helper_rate:150,helpers_paid:false,
 diesel:0,tolls:0,other_expenses:0},1800);
 assert.equal(c.driverDue,0);assert.equal(c.helperDue,300);assert.equal(c.result,1250);
});
test("sem frete informado nao inventa margem",()=>{assert.equal(cargoCosts(null,null).result,null);});