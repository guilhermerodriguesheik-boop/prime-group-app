import test from "node:test";
import assert from "node:assert/strict";
import {getEvolutionGoPollIdentity} from "../src/lib/banks/evolution-go-poll-identity.ts";
const phone="5521991234567@s.whatsapp.net";
const lid="998877665544332211@lid";
test("Evolution Go poll vote accepts @lid sender only via authenticated private chat phone",()=>{
 assert.deepEqual(getEvolutionGoPollIdentity({
  isPoll:true,senderJid:lid,chatJid:phone
 }),{phone:"5521991234567",voterJid:lid});
 assert.deepEqual(getEvolutionGoPollIdentity({
  isPoll:true,senderJid:lid,chatJid:lid,chatAlt:phone
 }),{phone:"5521991234567",voterJid:lid});
 assert.equal(getEvolutionGoPollIdentity({
  isPoll:true,senderJid:lid,chatJid:lid
 }),null);
 assert.equal(getEvolutionGoPollIdentity({
  isPoll:true,senderJid:lid,chatJid:"123@g.us",chatAlt:phone
 }),null);
});
test("non-poll messages still demand strict phone-form sender and chat",()=>{
 assert.deepEqual(getEvolutionGoPollIdentity({
  isPoll:false,senderJid:phone,chatJid:phone
 }),{phone:"5521991234567",voterJid:phone});
 assert.equal(getEvolutionGoPollIdentity({
  isPoll:false,senderJid:lid,chatJid:phone
 }),null);
 assert.equal(getEvolutionGoPollIdentity({
  isPoll:false,senderJid:phone,chatJid:lid
 }),null);
});
