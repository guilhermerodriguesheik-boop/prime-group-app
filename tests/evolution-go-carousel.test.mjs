import test from "node:test";
import assert from "node:assert/strict";
import {bankCarouselPayload} from "../src/lib/banks/evolution-go-carousel.ts";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("NativeFlow carousel holds precisely one bank movement and two image-backed cards",()=>{
 const payload=bankCarouselPayload("5521999999999","SAÍDA · R$ 60,00",id);
 assert.equal(payload.cards.length,2);
 assert.ok(payload.body.includes("R$ 60,00"));
 assert.ok(payload.cards.every(c=>c.header.imageUrl.startsWith("https://")));
 assert.ok(payload.cards.every(c=>c.buttons.length===3));
 assert.ok(payload.cards.every(c=>c.buttons.every(b=>b.type==="REPLY")));
 assert.equal(new Set(payload.cards.flatMap(c=>c.buttons.map(b=>b.id))).size,6);
 assert.ok(payload.cards.flatMap(c=>c.buttons).every(b=>b.id.includes(id)));
});
test("more options refer to the same message, never a separate movement",()=>{
 const p=bankCarouselPayload("5521999999999","ENTRADA · R$ 900,00",id,true);
 assert.equal(p.cards[0].header.title,"Outras categorias");
 assert.ok(p.cards[0].buttons.some(b=>b.displayText==="Transferência"));
});
