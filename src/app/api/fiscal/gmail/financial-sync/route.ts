import "server-only";
import {NextResponse} from "next/server";
import {ownerWorkspace,syncOrtobomFinancialReports} from "@/lib/fiscal/gmail";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)return NextResponse.json({error:"Origem inválida."},{status:403});
 if(req.headers.get("x-prime-action")!=="ortobom-financial-sync")
  return NextResponse.json({error:"Requisição inválida."},{status:403});
 try{
  const {workspaceId,ownerId}=await ownerWorkspace();
  const data=await syncOrtobomFinancialReports(workspaceId,ownerId);
  return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({error:"Não foi possível importar os demonstrativos financeiros da Ortobom."},{status:503});
 }
}
