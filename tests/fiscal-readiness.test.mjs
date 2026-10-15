import test from "node:test";
import assert from "node:assert/strict";
import { probeGoogleClient } from "../src/lib/fiscal/google-credential.ts";
import { fiscalReadiness } from "../src/lib/fiscal/readiness.ts";
const reply=(error)=>async()=>new Response(JSON.stringify({error}),{status:400});
test("invalid_client rejeita o segredo sem iniciar OAuth de usuário",async()=>{
 assert.equal(await probeGoogleClient("cid","secret",reply("invalid_client")),"rejected");
});
test("invalid_grant com refresh fictício atesta ID/segredo aceitos, sem autenticar conta",async()=>{
 assert.equal(await probeGoogleClient("cid","secret",reply("invalid_grant")),"accepted");
 assert.equal(await probeGoogleClient("cid",undefined,reply("invalid_grant")),"not_configured");
});
test("indisponibilidade da rede não produz falso positivo",async()=>{
 assert.equal(await probeGoogleClient("cid","secret",async()=>{throw Error("offline")}),"unknown");
});
test("raio-x fiscal nunca declara SEFAZ pronta só porque há token ou NF-e",()=>{
 const base={gmailConnected:false,gmailClientAccepted:false,gmailClientRejected:true,nfeCount:5,
 cteDraftCount:5,hasDriver:false,hasVehicle:true,rntrcProvided:false,focusHomologation:false,
 focusProduction:false,authorizedCteCount:0,fiscalDataReviewed:false};
 const steps=fiscalReadiness(base);
 assert.equal(steps.find(x=>x.id==="gmail").state,"blocked");
 assert.equal(steps.find(x=>x.id==="nfe").state,"done");
 assert.equal(steps.find(x=>x.id==="mdfe").state,"pending");
 assert.equal(steps.filter(x=>x.state==="done").length,1);
});
