import "server-only";
import {NextResponse} from "next/server";
import {ownerWorkspace,syncGmailWorkspace,syncOrtobomFinancialReports,syncOutboundCteEmails} from "@/lib/fiscal/gmail";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)return NextResponse.json({error:"Origem inválida."},{status:403});
 if(req.headers.get("x-prime-action")!=="prime-operations-email-sync")return NextResponse.json({error:"Requisição inválida."},{status:403});
 try{
  const {workspaceId,ownerId}=await ownerWorkspace();
  const [cargos,finance,cteEmails]=await Promise.allSettled([
    syncGmailWorkspace(workspaceId,ownerId),
    syncOrtobomFinancialReports(workspaceId,ownerId),
    syncOutboundCteEmails(workspaceId,ownerId),
  ]);
  if([cargos,finance,cteEmails].every(x=>x.status==="rejected"))
   return NextResponse.json({error:"Nenhuma importação concluída. Verifique o Gmail conectado."},{status:503});
  return NextResponse.json({
   cargos:cargos.status==="fulfilled"?cargos.value:{scanned:0,imported:0,invoices:0,errors:1},
   finance:finance.status==="fulfilled"?finance.value:{scanned:0,imported:0,errors:1},
   cteEmails:cteEmails.status==="fulfilled"?cteEmails.value:{scanned:0,imported:0,errors:1},
  },{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({error:"Sincronização indisponível. Confira o Gmail da Prime Group."},{status:503});
 }
}
