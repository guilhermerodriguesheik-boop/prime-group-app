import test from "node:test";
import assert from "node:assert/strict";
import {webhookReady,webhookNeedsRepair} from "../src/lib/banks/webhook-health.ts";
const target="https://prime-finance-ochre.vercel.app/api/banks/webhook";
const base={id:"one",url:target,event:"item/updated",disabledAt:null,
 headers:{"X-Prime-Webhook-Key":"long-valid-secret"}};
test("healthy subscribed webhook is verified",()=>{
 assert.equal(webhookReady(base,target,"item/updated","long-valid-secret"),true);
 assert.equal(webhookNeedsRepair(base,target,"item/updated","long-valid-secret"),false);
});
test("missing or rotated headers must be repaired",()=>{
 assert.equal(webhookReady({...base,headers:{}},target,"item/updated","long-valid-secret"),false);
 assert.equal(webhookNeedsRepair({...base,headers:{"x-prime-webhook-key":"wrong"}},target,
  "item/updated","long-valid-secret"),true);
});
test("disabled webhooks are not healthy",()=>{
 const x={...base,disabledAt:"2026-10-10T12:00:00.000Z"};
 assert.equal(webhookNeedsRepair(x,target,"item/updated","long-valid-secret"),true);
});
test("never repair unrelated webhook listeners",()=>{
 assert.equal(webhookNeedsRepair({...base,url:"https://other.com/callback"},
  target,"item/updated","long-valid-secret"),false);
 assert.equal(webhookNeedsRepair({...base,event:"item/error"},
  target,"item/updated","long-valid-secret"),false);
});