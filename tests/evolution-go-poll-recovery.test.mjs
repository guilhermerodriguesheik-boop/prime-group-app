import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {recoverOwnerPollVote} from "../src/lib/banks/evolution-go-poll-recovery.ts";
const pollId="3EB0123456789999",phone="5521998765432";
const voteId="3EB0987654321111";
function result(label="Empresa",owner=phone){
 return {pollMessageId:pollId,totalVotes:1,votes:[{pollMessageId:pollId,
  voterPhone:owner,voterJid:owner+"@s.whatsapp.net",voteMessageId:voteId,
  selectedOptions:[createHash("sha256").update(label).digest("hex")]}]};
}
test("recovers only one authenticated vote for the expected recipient",()=>{
 assert.deepEqual(recoverOwnerPollVote(result(),pollId,phone),{
  destination:"prime",voteId});
 assert.deepEqual(recoverOwnerPollVote({data:result("Pessoal")},pollId,phone),{
  destination:"personal",voteId});
});
test("rejects missing, nonowner, multiple, tampered and unknown poll results",()=>{
 assert.equal(recoverOwnerPollVote({error:"No votes found"},pollId,phone),null);
 assert.equal(recoverOwnerPollVote(result("Empresa","5521000000000"),pollId,phone),null);
 assert.equal(recoverOwnerPollVote(result("Empresa"),"DIFFERENT123",phone),null);
 assert.equal(recoverOwnerPollVote({...result(),totalVotes:2},pollId,phone),null);
 assert.equal(recoverOwnerPollVote({...result(),votes:[]},pollId,phone),null);
 assert.equal(recoverOwnerPollVote(result("Unsupported"),pollId,phone),null);
 assert.equal(recoverOwnerPollVote({...result(),votes:[{...result().votes[0],selectedOptions:[]}]},pollId,phone),null);
});
