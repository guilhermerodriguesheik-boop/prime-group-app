import test from "node:test";
import assert from "node:assert/strict";
import {reviewSuggestions} from "../src/lib/finance/bank-review-suggestions.ts";
const tx=(direction,amount=500)=>({id:"t",workspace_id:"prime",
 occurred_on:"2026-10-17",amount,direction,description:"Pix transferido"});
const bill={id:"p",workspace_id:"prime",description:"Diesel caminhão",
 amount:500,settled:0,status:"open",kind:"payable",due_date:"2026-10-18"};
test("exact value, date and workspace give a suggestion, not an automatic settlement",()=>{
 const hints=reviewSuggestions(tx("debit"),[bill],[],[]);
 assert.deepEqual(hints,["Possível conta: Diesel caminhão"]);
});
test("cross workspace and opposite direction do not match",()=>{
 assert.deepEqual(reviewSuggestions(tx("credit"),[bill],[],[]),[]);
 assert.deepEqual(reviewSuggestions(tx("debit"),[{...bill,workspace_id:"personal"}],[],[]),[]);
});
test("ambiguity never selects just one account",()=>{
 const hints=reviewSuggestions(tx("debit"),[bill,{...bill,id:"second"}],[],[]);
 assert.deepEqual(hints,["2 contas possíveis (valor e vencimento)"]);
});
test("recurring monthly charges can be flagged, without posting payments",()=>{
 const hints=reviewSuggestions(tx("debit"),[],[{workspace_id:"prime",description:"Aluguel",
  amount:500,due_day:17,frequency:"monthly"}],[]);
 assert.deepEqual(hints,["Possível recorrência: Aluguel"]);
});
test("receipt can show possible Ortobom cargo based on same date and amount",()=>{
 const hints=reviewSuggestions(tx("credit",900),[],[],[{workspace_id:"prime",reference:"030061",
  date:"2026-10-16",amount:900}]);
 assert.deepEqual(hints,["Possível acerto Ortobom: 030061"]);
});
test("different dates/amounts do not match",()=>{
 assert.deepEqual(reviewSuggestions(tx("credit",900),[],[],[{workspace_id:"prime",reference:"030061",date:"2026-09-01",amount:900}]),[]);
});
