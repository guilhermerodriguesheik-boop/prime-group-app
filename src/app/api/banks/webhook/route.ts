import {timingSafeEqual} from "node:crypto";
import {after,NextResponse} from "next/server";
import {primeRpc} from "@/lib/whatsapp/prime-automations";
import {drainPluggyEventInbox} from "@/lib/banks/event-worker";

export const runtime="nodejs";
export const maxDuration=60;
type EventBody={event?:string;eventId?:string;itemId?:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function authorized(token:string,expected:string){
 const a=Buffer.from(token),b=Buffer.from(expected);
 return expected.length>=32&&a.length===b.length&&timingSafeEqual(a,b);
}
export async function POST(req:Request){
 const secret=process.env.PLUGGY_WEBHOOK_SECRET||"";
 const incoming=req.headers.get("x-prime-webhook-key")||"";
 if(!authorized(incoming,secret))return NextResponse.json({error:"Unauthorized"},{status:401});
 if(Number(req.headers.get("content-length")||0)>4096)return NextResponse.json({error:"Too large"},{status:413});
 let event:EventBody;
 try{event=await req.json() as EventBody;}catch{return NextResponse.json({error:"Invalid event"},{status:400});}
 if(!event.itemId||!event.eventId||!uuid.test(event.itemId)||!uuid.test(event.eventId))
  return NextResponse.json({accepted:false},{status:202});
 if(event.event!=="item/updated"&&event.event!=="transactions/created")
  return NextResponse.json({accepted:false},{status:202});
 try{
  // Durable transaction before acknowledging Pluggy. A 5xx permits upstream retry.
  const saved=await primeRpc<boolean>("prime_enqueue_pluggy_event",{
    p_event_id:event.eventId,p_item_id:event.itemId,p_kind:event.event,
  });
  if(!saved)return NextResponse.json({accepted:false},{status:202});
 }catch(error){
  console.error("Pluggy event persistence failed",error instanceof Error?error.message:"unknown");
  return NextResponse.json({error:"Event temporarily unavailable"},{status:503});
 }
 after(async()=>{
  try{await drainPluggyEventInbox(2);}
  catch(error){console.error("Async Pluggy worker unavailable",error instanceof Error?error.message:"unknown");}
 });
 return NextResponse.json({accepted:true},{status:202,headers:{"Cache-Control":"no-store"}});
}
