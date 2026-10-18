import {createHash} from "node:crypto";
import {BANK_POLL_OPTIONS,type BankPollArea} from "./evolution-go-poll-votes";
type Json=Record<string,unknown>;
const obj=(v:unknown):Json=>v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{};
const cleanPhone=(s:unknown)=>typeof s==="string"?s.replace(/\\D/g,""):"";
/** Never classify on votes from another recipient or ambiguous vote tallies. */
export function recoverOwnerPollVote(raw:unknown,pollId:string,phone:string):
 {destination:BankPollArea;voteId:string}|null {
 if(!/^[A-Za-z0-9_-]{8,150}$/.test(pollId)||!/^[0-9]{10,15}$/.test(phone))return null;
 const top=obj(raw),data=obj(top.data);
 const value=data.pollMessageId?data:top;
 if(value.pollMessageId!==pollId||value.totalVotes!==1||!Array.isArray(value.votes)
   ||value.votes.length!==1)return null;
 const vote=obj(value.votes[0]);
 const voterPhone=cleanPhone(vote.voterPhone);
 const voterJid=typeof vote.voterJid==="string"?vote.voterJid:"";
 const voterMatches=voterPhone===phone ||
  voterJid===phone+"@s.whatsapp.net";
 if(!voterMatches||!Array.isArray(vote.selectedOptions)||
  vote.selectedOptions.length!==1)return null;
 const hash=vote.selectedOptions[0];
 if(typeof hash!=="string"||!/^[0-9a-fA-F]{64}$/.test(hash))return null;
 const voteId=vote.voteMessageId;
 if(typeof voteId!=="string"||!/^[A-Za-z0-9_-]{8,150}$/.test(voteId))return null;
 for(const choice of BANK_POLL_OPTIONS){
  if(createHash("sha256").update(choice.label,"utf8").digest("hex")===hash.toLowerCase())
   return {destination:choice.destination,voteId};
 }
 return null;
}
