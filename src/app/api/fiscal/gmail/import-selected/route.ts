import "server-only";
import {NextResponse} from "next/server";
import {ownerWorkspace,importSelectedOrtobomInbox} from "@/lib/fiscal/gmail";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)return NextResponse.json({error:"Origem inválida."},{status:403});
 if(req.headers.get("x-prime-action")!=="fiscal-gmail-import-selected")
  return NextResponse.json({error:"Requisição inválida."},{status:403});
 const body=await req.json().catch(()=>null) as {ids?:unknown}|null;
 const ids=body?.ids;
 if(!Array.isArray(ids)||ids.length===0||ids.length>8||new Set(ids).size!==ids.length||
    ids.some(x=>typeof x!=="string"||!/^[a-zA-Z0-9_-]{8,40}$/.test(x)))
  return NextResponse.json({error:"Selecione de 1 a 8 mensagens válidas."},{status:400});
 try{
  const {workspaceId,ownerId}=await ownerWorkspace();
  const result=await importSelectedOrtobomInbox(workspaceId,ownerId,ids);
  return NextResponse.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({error:"Falha ao importar e-mails selecionados. Confira a autorização Google."},{status:503});
 }
}