import test from "node:test";
import assert from "node:assert/strict";
import {createHash,createCipheriv,hkdfSync} from "node:crypto";
import {pollVoteDestination,parseEvolutionGoPollSend,BANK_POLL_OPTIONS} from "../src/lib/banks/evolution-go-poll-votes.ts";
const id="3EB0AA20261017";
const from="5521999999999@s.whatsapp.net",voter="5521888888888@s.whatsapp.net";
const secret=Buffer.alloc(32,7),iv=Buffer.alloc(12,13);
function encrypted(option){
 const hash=createHash("sha256").update(option).digest();
 const proto=Buffer.concat([Buffer.from([0x0a,0x20]),hash]);
 const key=Buffer.from(hkdfSync("sha256",secret,Buffer.alloc(0),
  Buffer.from(id+from+voter+"Poll Vote"),32));
 const cipher=createCipheriv("aes-256-gcm",key,iv);
 cipher.setAAD(Buffer.from(id+"\0"+voter));
 const data=Buffer.concat([cipher.update(proto),cipher.final(),cipher.getAuthTag()]);
 return {pollCreationMessageKey:{ID:id,remoteJID:from,fromMe:false},
  vote:{encIV:iv.toString("base64"),encPayload:data.toString("base64")}};
}
test("each poll option is mapped to exactly one financial destination",()=>{
 assert.equal(BANK_POLL_OPTIONS.length,5);
 for(const choice of BANK_POLL_OPTIONS){
  const update=encrypted(choice.label);
  assert.equal(pollVoteDestination(id,secret.toString("base64"),update,voter,from),
   choice.destination);
 }
});
test("tampered encrypted votes, other senders and unknown polls cannot classify",()=>{
 const update=encrypted("Empresa");
 assert.equal(pollVoteDestination("OTHERID2026",secret.toString("base64"),update,voter,from),null);
 assert.equal(pollVoteDestination(id,secret.toString("base64"),update,"5521777777777@s.whatsapp.net",from),null);
 const t=structuredClone(update);
 t.vote.encPayload=Buffer.from("corrupted payload").toString("base64");
 assert.equal(pollVoteDestination(id,secret.toString("base64"),t,voter,from),null);
 assert.equal(pollVoteDestination(id,"fake",update,voter,from),null);
});
test("Evolution Go poll creation must include message ID AND decryptable secret",()=>{
 const data={data:{Info:{ID:id},Message:{messageContextInfo:{messageSecret:secret.toString("base64")}}}};
 assert.deepEqual(parseEvolutionGoPollSend(data),{id,secret:secret.toString("base64")});
 assert.equal(parseEvolutionGoPollSend({data:{Info:{ID:id}}}),null);
});
