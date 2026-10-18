import {createHmac,timingSafeEqual} from "node:crypto";

const outboxPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const threeDays=72*60*60*1000;

function mac(secret:string,id:string,expires:number){
 return createHmac("sha256",secret).update("prime-bank-action-v1:"+id.toLowerCase()+":"+expires).digest("hex");
}

/** A bearer action link authorizes only classifying one WhatsApp bank-card, not payments. */
export function bankActionLink(id:string,base:string,secret:string,now=Date.now()):string|null {
 if(!outboxPattern.test(id)||secret.length<24)return null;
 try{
  const url=new URL(base);
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.hostname==="localhost")return null;
  const expires=Math.floor((now+threeDays)/1000);
  const action=new URL("/bancos/classificar/"+id.toLowerCase(),url.origin);
  action.searchParams.set("expires",String(expires));
  action.searchParams.set("sig",mac(secret,id,expires));
  return action.href;
 }catch{return null;}
}
export function verifyBankAction(id:string,expiresText:string,sig:string,secret:string,now=Date.now()){
 if(!outboxPattern.test(id)||secret.length<24||!/^\d{10}$/.test(expiresText)
 ||!/^[a-f0-9]{64}$/.test(sig))return false;
 const expires=Number(expiresText);
 if(!Number.isSafeInteger(expires)||expires*1000<=now
 ||expires*1000>now+threeDays+60000)return false;
 const expected=Buffer.from(mac(secret,id,expires),"hex");
 const received=Buffer.from(sig,"hex");
 return expected.length===received.length&&timingSafeEqual(expected,received);
}
/**
 * WhatsApp may hyperlink only the URL path and drop a long ?expires&sig query.
 * A 36-byte signed bearer token (16-byte outbox UUID + 4-byte expiry +
 * 16-byte MAC) fits a single query-free URL path segment.
 */
function publicOrigin(raw:string):string|null{
 try{
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.port||
     url.hostname==="localhost"||url.hostname==="127.0.0.1")return null;
  return url.origin;
 }catch{return null;}
}
export function compactBankActionLink(id:string,base:string,secret:string,now=Date.now()):string|null{
 const origin=publicOrigin(base);
 if(!origin||!outboxPattern.test(id)||secret.length<24)return null;
 const expires=Math.floor((now+threeDays)/1000);
 const payload=Buffer.alloc(20);
 Buffer.from(id.replace(/-/g,""),"hex").copy(payload,0);
 payload.writeUInt32BE(expires,16);
 const signature=createHmac("sha256",secret)
  .update("prime-bank-action-v2:").update(payload).digest().subarray(0,16);
 const token=Buffer.concat([payload,signature]).toString("base64url");
 return new URL("/b/"+token,origin).href;
}
/** Decode a bearer token only after checking expiry and constant-time MAC. */
export function compactBankActionTarget(token:string,base:string,secret:string,now=Date.now()):string|null{
 const origin=publicOrigin(base);
 if(!origin||secret.length<24||!/^[A-Za-z0-9_-]{48}$/.test(token))return null;
 const bytes=Buffer.from(token,"base64url");
 if(bytes.length!==36||bytes.toString("base64url")!==token)return null;
 const payload=bytes.subarray(0,20);
 const supplied=bytes.subarray(20);
 const expected=createHmac("sha256",secret)
  .update("prime-bank-action-v2:").update(payload).digest().subarray(0,16);
 if(!timingSafeEqual(expected,supplied))return null;
 const expires=payload.readUInt32BE(16);
 if(expires*1000<=now||expires*1000>now+threeDays+60000)return null;
 const hex=payload.subarray(0,16).toString("hex");
 const id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-");
 return signedTarget(id,expires,origin,secret);
}
function signedTarget(id:string,expires:number,base:string,secret:string):string{
 const target=new URL("/bancos/classificar/"+id.toLowerCase(),base);
 target.searchParams.set("expires",String(expires));
 target.searchParams.set("sig",mac(secret,id,expires));
 return target.href;
}

export function bankActionLinkFromEnv(id:string):string|null{
 const raw=process.env.PRIME_FINANCE_PUBLIC_URL||
   process.env.APP_BASE_URL||
   "https://prime-finance-ochre.vercel.app";
 const secret=process.env.WHATSAPP_INGRESS_SECRET||"";
 const url=compactBankActionLink(id,raw,secret);
 if(url)return url;
 // Localhost is the template value for APP_BASE_URL; never send it in WhatsApp.
 return compactBankActionLink(id,"https://prime-finance-ochre.vercel.app",secret);
}
