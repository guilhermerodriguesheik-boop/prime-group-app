import test from "node:test";
import assert from "node:assert/strict";
import {diagnoseGmailFailure,gmailConnectionHealth} from "../src/lib/fiscal/gmail-sync-health.ts";
test("expired refresh token asks to renew Google consent without leaking credentials",()=>{
  assert.deepEqual(diagnoseGmailFailure({name:"GmailOAuthError",code:"invalid_grant",message:"invalid_grant"}),{
    code:"reconnect",message:"A autorização do Gmail expirou ou foi revogada. Clique em Renovar conexão Google."
  });
});
test("wrong OAuth client is not treated as expired token",()=>{
  assert.equal(diagnoseGmailFailure({code:"invalid_client"}).code,"oauth_client");
});
test("unknown errors never expose upstream details or secrets",()=>{
  const result=diagnoseGmailFailure(new Error("debug: refresh_token=super-secret"));
  assert.equal(result.code,"temporarily_unavailable");
  assert.equal(result.message.includes("super-secret"),false);
});
test("stored OAuth record alone does not prove successful syncing",()=>{
  const now=Date.parse("2026-11-09T18:30:00Z");
  assert.equal(gmailConnectionHealth({connected:true,lastCargoSync:"2026-10-17T04:11:09Z",lastFinancialSync:"2026-10-17T04:10:49Z",lastError:null},now),"stale");
  assert.equal(gmailConnectionHealth({connected:true,lastCargoSync:null,lastFinancialSync:null,lastError:null},now),"never_synced");
  assert.equal(gmailConnectionHealth({connected:false,lastCargoSync:null,lastFinancialSync:null,lastError:null},now),"disconnected");
});
test("stored connection failure overrides stale state",()=>{
  const now=Date.parse("2026-11-09T18:30:00Z");
  assert.equal(gmailConnectionHealth({connected:true,lastCargoSync:"2026-10-17T04:11:09Z",lastFinancialSync:null,lastError:"Falha de conexão Google. Reconecte se necessário."},now),"reconnect");
});
test("partial imported emails are marked for review, not success",()=>{
  const now=Date.parse("2026-11-09T18:30:00Z");
  assert.equal(gmailConnectionHealth({connected:true,lastCargoSync:"2026-11-09T17:00:00Z",lastFinancialSync:"2026-11-09T17:00:00Z",lastError:"2 e-mail(s) necessitam conferência manual"},now),"review");
});
