import {createDecipheriv,createHash,hkdfSync} from "node:crypto";

/** Native WhatsApp PollCreationMessage options — one tappable choice per movement. */
export const BANK_POLL_OPTIONS=[
 {label:"Empresa",destination:"prime"},
 {label:"Pessoal",destination:"personal"},
 {label:"Empréstimos",destination:"interest"},
 {label:"Transferência",destination:"transfer"},
 {label:"Pendente",destination:"pending"}
] as const;
export type BankPollArea=(typeof BANK_POLL_OPTIONS)[number]["destination"];

type Dict=Record<string,unknown>;
const object=(x:unknown):Dict=>x&&typeof x==="object"&&!Array.isArray(x)?x as Dict:{};
function bytes(raw:unknown):Buffer|null{
 try{
  if(typeof raw==="string"){
   if(!/^[A-Za-z0-9+/_=-]{8,40000}$/.test(raw))return null;
   return Buffer.from(raw.replace(/-/g,"+").replace(/_/g,"/"),"base64");
  }
  const o=object(raw);
  if(o.type==="Buffer"&&Array.isArray(o.data)&&o.data.length<=10000)
    return Buffer.from(o.data as number[]);
 }catch{}
 return null;
}
function normalizeJid(value:string):string|null{
 if(!/^[A-Za-z0-9:._-]{2,50}@(s\.whatsapp\.net|lid)$/.test(value))return null;
 return value.replace(/:\d+@/,"@");
}
function selectedHashes(bytesPlain:Buffer):Buffer[]|null{
 if(bytesPlain.length>512)return null;
 const result:Buffer[]=[];
 let i=0;
 function nextVarint():number|null{
  let n=0,mult=1;
  for(let j=0;j<7&&i<bytesPlain.length;j++){
   const x=bytesPlain[i++];n+=(x&127)*mult;
   if(!(x&128))return n;
   mult*=128;
  }
  return null;
 }
 while(i<bytesPlain.length){
  const tag=nextVarint();
  if(tag===null)return null;
  const field=Math.floor(tag/8),wire=tag%8;
  if(wire===0){
   if(nextVarint()===null)return null;
  }else if(wire===2){
   const size=nextVarint();
   if(size===null||size<0||i+size>bytesPlain.length)return null;
   if(field===1){
    if(size!==32||result.length>1)return null;
    result.push(bytesPlain.subarray(i,i+size));
   }
   i+=size;
  }else return null;
 }
 return result;
}
export function pollVoteDestination(
 pollId:string,messageSecret:unknown,pollUpdateRaw:unknown,
 voterJidRaw:string,originalJidRaw:string
):BankPollArea|null{
 const update=object(pollUpdateRaw),vote=object(update.vote);
 const secret=bytes(messageSecret),iv=bytes(vote.encIV??vote.encIv),
  encrypted=bytes(vote.encPayload);
 const voter=normalizeJid(voterJidRaw);
 const key=object(update.pollCreationMessageKey);
 if(!/^[A-Za-z0-9_-]{8,150}$/.test(pollId)||
  (key.ID??key.id)!==pollId||!secret||secret.length!==32||
  !iv||iv.length!==12||!encrypted||encrypted.length<17||encrypted.length>2048||
  !voter)return null;
 const candidates=[String(key.remoteJID||key.remoteJid||""),
  originalJidRaw].map(normalizeJid).filter((x):x is string=>!!x);
 for(const origin of [...new Set(candidates)]){
  try{
   const info=Buffer.from(pollId+origin+voter+"Poll Vote");
   const derived=Buffer.from(hkdfSync("sha256",secret,Buffer.alloc(0),info,32));
   const cipher=createDecipheriv("aes-256-gcm",derived,iv);
   cipher.setAAD(Buffer.from(pollId+"\0"+voter));
   cipher.setAuthTag(encrypted.subarray(-16));
   const plain=Buffer.concat([cipher.update(encrypted.subarray(0,-16)),cipher.final()]);
   const hashes=selectedHashes(plain);
   if(!hashes||hashes.length!==1)return null;
   for(const opt of BANK_POLL_OPTIONS){
    if(createHash("sha256").update(opt.label,"utf8").digest().equals(hashes[0]))
      return opt.destination;
   }
  }catch{/* Try alternate orig sender for WhatsApp LID/phone migrations. */}
 }
 return null;
}
export function parseEvolutionGoPollSend(raw:unknown){
 const data=object(object(raw).data);
 const info=object(data.Info||data.info);
 const message=object(data.Message||data.message);
 const context=object(message.messageContextInfo);
 const id=typeof info.ID==="string"?info.ID:"";
 const secret=bytes(context.messageSecret);
 if(!/^[A-Za-z0-9_-]{8,150}$/.test(id)||!secret||secret.length!==32)return null;
 return {id,secret:secret.toString("base64")};
}
