import {timingSafeEqual} from "node:crypto";
import {after,NextResponse} from "next/server";
import {pluggyAccounts,pluggyApiKey,pluggyItem,pluggyTransactions} from "@/lib/banks/pluggy";
import {primeRpc,runPrimeOutbox} from "@/lib/whatsapp/prime-automations";

export const runtime="nodejs";
export const maxDuration=60;
type EventBody={event?:string;eventId?:string;itemId?:string};
function authorized(token:string,expected:string){
 const a=Buffer.from(token),b=Buffer.from(expected);
 return expected.length>=32&&a.length===b.length&&timingSafeEqual(a,b);
}
async function ingest(itemId:string){
 const key=await pluggyApiKey();
 const item=await pluggyItem(key,itemId);
 if(item.id!==itemId || item.status!=="UPDATED")return;
 const accounts=await pluggyAccounts(key,itemId);
 for(const a of accounts.slice(0,15)){
  if(!a.id||a.type!=="BANK")continue;
  const dateFrom=new Date(Date.now()-7*86400_000).toISOString().slice(0,10);
  const transactions=await pluggyTransactions(key,a.id,dateFrom,5);
  const rows=transactions.filter(t=>
   t.id&&t.date&&Number.isFinite(t.amount)&&Math.abs(t.amount||0)<=100000000
  ).map(t=>({
   id:t.id,date:t.date!.slice(0,10),description:(t.description||t.descriptionRaw||"Movimentação").slice(0,350),
   amount:Math.abs(t.amount!),direction:t.type==="DEBIT"?"debit":t.type==="CREDIT"?"credit":t.amount!<0?"debit":"credit",
   status:t.status==="PENDING"?"PENDING":"POSTED",
  }));
  for(let pos=0;pos<rows.length;pos+=80){
   await primeRpc("prime_bank_import_event",{
    p_item_id:itemId,p_account_id:a.id,p_rows:rows.slice(pos,pos+80),
   });
  }
 }
 await runPrimeOutbox();
}
export async function POST(req:Request){
 const secret=process.env.PLUGGY_WEBHOOK_SECRET||"";
 const incoming=req.headers.get("x-prime-webhook-key")||"";
 if(!authorized(incoming,secret))return NextResponse.json({error:"Unauthorized"},{status:401});
 if(Number(req.headers.get("content-length")||0)>4096)return NextResponse.json({error:"Too large"},{status:413});
 let event:EventBody;
 try{event=await req.json() as EventBody;}catch{return NextResponse.json({error:"Invalid event"},{status:400});}
 if(!event.itemId||!event.eventId||!/^[0-9a-f-]{36}$/i.test(event.itemId)||
    !/^[0-9a-f-]{36}$/i.test(event.eventId))
  return NextResponse.json({accepted:false},{status:202});
 if(event.event!=="item/updated"&&event.event!=="transactions/created")
  return NextResponse.json({accepted:false},{status:202});
 // Pluggy expects a quick 2xx; process only the already-authenticated event
 // after the response using Vercel's supported after() execution lifecycle.
 after(async()=>{
  try{await ingest(event.itemId!);}catch(error){
   console.error("Pluggy asynchronous ingest failed",error instanceof Error?error.message:"unknown");
  }
 });
 return NextResponse.json({accepted:true},{status:202,headers:{"Cache-Control":"no-store"}});
}
