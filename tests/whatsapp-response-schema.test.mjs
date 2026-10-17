import test from "node:test";
import assert from "node:assert/strict";
import {whatsAppResponseSchema} from "../src/lib/whatsapp/response-schema.ts";
test("all action fields must be required in OpenAI strict output",()=>{
 assert.equal(whatsAppResponseSchema.shape.answer.isOptional(),false);
 assert.equal(whatsAppResponseSchema.shape.actions.isOptional(),false);
 const action=whatsAppResponseSchema.shape.actions.element;
 for(const [name,field] of Object.entries(action.shape)){
  assert.equal(field.isOptional(),false,"Missing required OpenAI output field "+name);
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
