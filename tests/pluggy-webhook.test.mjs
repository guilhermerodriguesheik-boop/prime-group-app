import assert from "node:assert/strict";
import test from "node:test";
import {PLUGGY_BANK_EVENTS,parsePluggyItemUpdated} from "../src/lib/banks/pluggy-webhook-events.ts";

const eventId="d876fd7c-e9bd-4c4c-bd46-cc96c62aac29";
const itemId="a5c763cb-0952-457b-9936-630f79c5b016";

test("Pluggy webhook subscribes to item updates, not transaction event without itemId",()=>{
 assert.deepEqual([...PLUGGY_BANK_EVENTS],["item/updated"]);
});
test("accept documented updated item payload with validated event ID",()=>{
 const valid={event:"item/updated",eventId,itemId,triggeredBy:"SYNC",clientUserId:"owner"};
 assert.deepEqual(parsePluggyItemUpdated(valid),{event:"item/updated",eventId,itemId});
});
test("reject transaction events that contain transactionIds instead of itemId",()=>{
 assert.equal(parsePluggyItemUpdated({event:"transactions/created",eventId,transactionIds:[itemId]}),null);
});
test("reject mismatched and untrusted body shapes without side effects",()=>{
 for(const payload of [
   null,undefined,{},[],{event:"item/updated",itemId},
   {event:"item/updated",eventId,itemId:"unexpected"},
   {event:"item/updated",eventId:"invalid",itemId},
   {event:"item/error",eventId,itemId},
   {event:"item/updated",eventId:123,itemId},
 ])assert.equal(parsePluggyItemUpdated(payload),null);
});
