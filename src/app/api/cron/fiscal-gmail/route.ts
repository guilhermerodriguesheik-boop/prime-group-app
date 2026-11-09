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
  const required=["SUPABASE_SERVICE_ROLE_KEY","GOOGLE_GMAIL_CLIENT_ID",
    "GOOGLE_GMAIL_CLIENT_SECRET","GMAIL_TOKEN_ENCRYPTION_KEY"] as const;
  const missing=required.filter(name=>!process.env[name]);
  if(missing.length){
    console.warn("Prime Gmail cron: missing variable names",missing.join(","));
    return NextResponse.json({ok:false,error:"Configuração Gmail incompleta.",missing},
      {status:503,headers:{"Cache-Control":"no-store"}});
  }
  try{
    const results=await syncAllGmailWorkspaces();
    const failed=results.filter(row=>
      ("error" in row&&Boolean(row.error))||("error" in row.finance&&Boolean(row.finance.error)));
    if(failed.length){
      console.warn("Prime Gmail cron: workspaces with import failures:",failed.length);
      return NextResponse.json({ok:false,error:"Sincronização Gmail com falhas.",results},
        {status:503,headers:{"Cache-Control":"no-store"}});
    }
    return NextResponse.json({ok:true,results},{headers:{"Cache-Control":"no-store"}});
  }catch{
    return NextResponse.json({ok:false,error:"Sincronização não disponível"},
      {status:503,headers:{"Cache-Control":"no-store"}});
  }
}
