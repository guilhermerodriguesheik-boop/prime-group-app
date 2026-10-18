import test from "node:test";
import assert from "node:assert/strict";
import {bankActionLink,verifyBankAction,compactBankActionLink,compactBankActionTarget} from "../src/lib/banks/whatsapp-action-link.ts";
import {bankTextFallbackMessage} from "../src/lib/banks/whatsapp-bank-fallback.ts";

const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secret="long-private-webhook-secret-0123456789";
const now=Date.UTC(2026,9,17,21,0,0);
test("one WhatsApp bank movement has tamper-resistant short-lived mobile buttons",()=>{
 const link=bankActionLink(id,"https://finance.example.com",secret,now);
 assert.ok(link);
 const url=new URL(link);
 assert.equal(url.protocol,"https:");
 assert.equal(url.pathname,"/bancos/classificar/"+id);
 assert.ok(verifyBankAction(id,url.searchParams.get("expires")||"",
  url.searchParams.get("sig")||"",secret,now));
 assert.equal(verifyBankAction("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  url.searchParams.get("expires")||"",url.searchParams.get("sig")||"",secret,now),false);
 assert.equal(verifyBankAction(id,url.searchParams.get("expires")||"",
  "0".repeat(64),secret,now),false);
 assert.equal(verifyBankAction(id,url.searchParams.get("expires")||"",
  url.searchParams.get("sig")||"",secret,now+73*60*60*1000),false);
 assert.equal(bankActionLink(id,"http://finance.example.com",secret,now),null);
 assert.equal(bankActionLink(id,"https://localhost:3000",secret,now),null);
 assert.equal(bankActionLink("wrong","https://finance.example.com",secret,now),null);
});
test("bank message displays one real URL with buttons instead of invisible carousel",()=>{
 const link=bankActionLink(id,"https://finance.example.com",secret,now);
 const text=bankTextFallbackMessage("SAÍDA · R$ 53,80",id,link);
 assert.match(text,/SAÍDA · R\$ 53,80/);
 assert.match(text,/Classificar com botões: https:\/\/finance\.example\.com\/bancos\/classificar\//);
 assert.ok(text.includes("\nClassificar com botões:"));
 assert.equal((text.match(/https:\/\//g)||[]).length,1);
 assert.doesNotMatch(text,/classificar AAAAAAAA empresa/);
});

test("WhatsApp links use one compact path, no query that the client can truncate",()=>{
 const link=compactBankActionLink(id,"https://finance.example.com",secret,now);
 assert.ok(link);
 const parsed=new URL(link);
 assert.equal(parsed.pathname.startsWith("/b/"),true);
 assert.equal(parsed.search,"");
 assert.equal(parsed.pathname.length,51);
 const token=parsed.pathname.slice(3);
 const target=compactBankActionTarget(token,"https://finance.example.com",secret,now);
 assert.ok(target);
 const next=new URL(target);
 assert.equal(next.pathname,"/bancos/classificar/"+id);
 assert.ok(verifyBankAction(id,next.searchParams.get("expires")||"",
  next.searchParams.get("sig")||"",secret,now));
 const text=bankTextFallbackMessage("ENTRADA · R$ 50,00",id,link);
 assert.ok(text.includes("Classificar com botões: "+link));
 assert.equal(text.split("https://").length,2);
 assert.equal(compactBankActionTarget((token[0]==="A"?"B":"A")+token.slice(1),"https://finance.example.com",secret,now),null);
 assert.equal(compactBankActionTarget(token,"https://finance.example.com",secret,now+73*3600000),null);
 assert.equal(compactBankActionTarget(token,"https://finance.example.com",secret+"tampered",now),null);
});
