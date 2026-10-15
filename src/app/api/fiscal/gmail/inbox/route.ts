import "server-only";
import {NextResponse} from "next/server";
import {ownerWorkspace,listOrtobomInbox} from "@/lib/fiscal/gmail";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(){
 try{
  const {workspaceId,ownerId}=await ownerWorkspace();
  const items=await listOrtobomInbox(workspaceId,ownerId);
  return NextResponse.json({items},{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({error:"Não foi possível consultar a caixa de entrada da Ortobom. Confira a conexão Gmail."},{status:503});
 }
}