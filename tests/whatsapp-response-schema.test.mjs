import test from "node:test";
import assert from "node:assert/strict";
import {z} from "zod";
import {whatsAppResponseSchema} from "../src/lib/whatsapp/response-schema.ts";
test("all action fields must be required in OpenAI strict output",()=>{
 const json=z.toJSONSchema(whatsAppResponseSchema);
 assert.ok(json.required.includes("answer"));
 assert.ok(json.required.includes("actions"));
 const action=json.properties.actions.items;
 for(const name of Object.keys(action.properties)){
  assert.ok(action.required.includes(name),"Missing required OpenAI output field "+name);
 }
 const output=whatsAppResponseSchema.parse({
  answer:"Recebi sua mensagem.",actions:[{
   kind:"note",workspace:null,certainty:"unconfirmed",description:"Consulta",
   direction:null,amount:null,date:null,recurrence:null,origin:null,destination:null,
   customer:null,driver:null,driverCost:null,freightValue:null,distanceKm:null,reference:null
  }]
 });
 assert.equal(output.actions[0].recurrence,null);
});
