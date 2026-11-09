import "server-only";
import {NextResponse} from "next/server";
import {ownerWorkspace,syncGmailWorkspace,syncOrtobomFinancialReports} from "@/lib/fiscal/gmail";
import {diagnoseGmailFailure} from "@/lib/fiscal/gmail-sync-health";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)
  return NextResponse.json({error:"Origem inválida."},{status:403});
 if(req.headers.get("x-prime-action")!=="prime-operations-email-sync")
  return NextResponse.json({error:"Requisição inválida."},{status:403});
 try{
  const {workspaceId,ownerId}=await ownerWorkspace();
  const [cargos,finance]=await Promise.allSettled([
   syncGmailWorkspace(workspaceId,ownerId),
   syncOrtobomFinancialReports(workspaceId,ownerId),
  ]);
  const cargoProblem=cargos.status==="rejected"?diagnoseGmailFailure(cargos.reason):null;
  const financeProblem=finance.status==="rejected"?diagnoseGmailFailure(finance.reason):null;
  if(cargoProblem&&financeProblem){
   const primary=[cargoProblem,financeProblem].find(problem=>problem.code!=="temporarily_unavailable")||cargoProblem;
   return NextResponse.json({ok:false,code:primary.code,error:primary.message},{status:503});
  }
  const cargoData=cargos.status==="fulfilled"?cargos.value:{scanned:0,imported:0,invoices:0,errors:1,skipped:0};
  const financeData=finance.status==="fulfilled"?finance.value:{scanned:0,imported:0,errors:1,skipped:0,hasMore:false};
  const warnings:string[]=[];
  if(cargoProblem)warnings.push("Cargas: "+cargoProblem.message);
  if(financeProblem)warnings.push("Financeiro: "+financeProblem.message);
  if(cargos.status==="fulfilled"&&cargos.value.errors)
    warnings.push(cargos.value.errors+" e-mail(s) de carga precisam de conferência.");
  if(finance.status==="fulfilled"&&finance.value.errors)
    warnings.push(finance.value.errors+" e-mail(s) financeiros precisam de conferência.");
  return NextResponse.json({
   ok:true,partial:warnings.length>0,warnings,cargos:cargoData,finance:financeData,
  },{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({ok:false,code:"temporarily_unavailable",error:"Não foi possível iniciar a sincronização. Confira seu login e o servidor."},{status:503});
 }
}
