import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncAllGmailWorkspaces } from "@/lib/fiscal/gmail";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:Request){
  const expected=process.env.CRON_SECRET||"";
  const actual=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
  if(expected.length<24||actual.length!==expected.length||
      !timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))
    return NextResponse.json({error:"Não autorizado"},{status:401});
  try{
    return NextResponse.json({results:await syncAllGmailWorkspaces()},{headers:{"Cache-Control":"no-store"}});
  }catch{
    return NextResponse.json({error:"Sincronização não disponível"},{status:503});
  }
}
