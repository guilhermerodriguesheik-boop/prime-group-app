import {timingSafeEqual} from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {ingestOrtobomEmail} from "@/lib/fiscal/ortobom-ingest";
export const runtime="nodejs";
export const maxDuration=60;
const schema=z.object({
 messageId:z.string().min(8).max(150),
 subject:z.string().min(5).max(240),
 body:z.string().min(15).max(12000),
 xmls:z.array(z.object({
  filename:z.string().min(5).max(150),
  content:z.string().min(100).max(1048576),
 })).min(1).max(30),
});
function authorized(actual:string){
 const secret=process.env.ORTOBOM_EMAIL_INGRESS_SECRET||"";
 const a=Buffer.from(actual),b=Buffer.from(secret);
 return secret.length>=32&&a.length===b.length&&timingSafeEqual(a,b);
}
export async function POST(req:Request){
 const incoming=req.headers.get("x-prime-email-key")||"";
 if(!authorized(incoming))return NextResponse.json({error:"Unauthorized"},{status:401});
 if(Number(req.headers.get("content-length")||0)>2500000)
  return NextResponse.json({error:"Payload too large"},{status:413});
 try{
  const raw=await req.text();
  if(raw.length>2500000)return NextResponse.json({error:"Payload too large"},{status:413});
  const parsed=schema.safeParse(JSON.parse(raw));
  if(!parsed.success)return NextResponse.json({error:"Invalid import data"},{status:400});
  const status=await ingestOrtobomEmail(parsed.data);
  return NextResponse.json(status,{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  console.error("Gmail cargo import failed",error instanceof Error?error.message:"unknown");
  return NextResponse.json({error:"Import unavailable; retry later"},{status:503});
 }
}
