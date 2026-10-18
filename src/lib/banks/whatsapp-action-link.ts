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
 if(!outboxPattern.test(id)||secret.length<24||!/^\\d{10}$/.test(expiresText)
 ||!/^[a-f0-9]{64}$/.test(sig))return false;
 const expires=Number(expiresText);
 if(!Number.isSafeInteger(expires)||expires*1000<=now
 ||expires*1000>now+threeDays+60000)return false;
 const expected=Buffer.from(mac(secret,id,expires),"hex");
 const received=Buffer.from(sig,"hex");
 return expected.length===received.length&&timingSafeEqual(expected,received);
}
export function bankActionLinkFromEnv(id:string):string|null{
 const raw=process.env.PRIME_FINANCE_PUBLIC_URL||
   process.env.APP_BASE_URL||
   "https://prime-finance-ochre.vercel.app";
 const secret=process.env.WHATSAPP_INGRESS_SECRET||"";
 const url=bankActionLink(id,raw,secret);
 if(url)return url;
 // Localhost is the template value for APP_BASE_URL; never send it in WhatsApp.
 return bankActionLink(id,"https://prime-finance-ochre.vercel.app",secret);
}
