import { NextResponse } from "next/server";
import { ownerWorkspace, syncGmailWorkspace } from "@/lib/fiscal/gmail";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request){
  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(request.url).origin)
    return NextResponse.json({error:"Origem inválida."},{status:403});
  // Evita requisições cross-site por formulários simples.
  if(request.headers.get("x-prime-action")!=="fiscal-gmail-sync")
    return NextResponse.json({error:"Requisição inválida."},{status:403});
  try{
    const {workspaceId,ownerId}=await ownerWorkspace();
    const stats=await syncGmailWorkspace(workspaceId,ownerId);
    return NextResponse.json({ok:true,...stats},{headers:{"Cache-Control":"no-store"}});
  }catch{
    return NextResponse.json({error:"Gmail indisponível ou não conectado. Confira o painel."},{status:503});
  }
}
