import "server-only";
import {NextResponse} from "next/server";
import {gather,session} from "@/lib/fiscal/cte-data";
import {checkDotCompanyProduction} from "@/lib/fiscal/dotcompany-production";
export const runtime="nodejs";
export const maxDuration=30;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Read-only fiscal readiness based on the SAME persisted CT-e review used by transmission.
 * Never claim sandbox readiness as production readiness; never transmit here.
 */
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)
  return NextResponse.json({error:"Origem inválida."},{status:403});
 if(req.headers.get("x-prime-action")!=="dotcompany-preflight")
  return NextResponse.json({error:"Requisição inválida."},{status:403});
 const body=await req.json().catch(()=>null) as {draftId?:unknown}|null;
 if(typeof body?.draftId!=="string"||!uuid.test(body.draftId))
  return NextResponse.json({error:"Rascunho inválido."},{status:400});
 const s=await session();
 if(!s)return NextResponse.json({error:"Entre na conta proprietária Prime."},{status:401});
 const gathered=await gather(s.workspaceId,s.db,body.draftId);
 if(!gathered)return NextResponse.json({error:"CT-e não encontrado."},{status:404});
 const {preview,submission}=gathered;
 const prod=await checkDotCompanyProduction(
  process.env.DOTCOMPANY_PRODUCTION_API_KEY,
  process.env.DOTCOMPANY_CTE_LIVE_ENABLED==="true",
 );
 const missing=[...preview.missing];
 if(!prod.authenticated)missing.push(prod.reason||"Credencial DotCompany de produção não autenticada.");
 if(prod.emitterLookup!=="ok")
  missing.push("A listagem de emissores DotCompany ainda não está disponível para esta chave.");
 if(submission)missing.push("Já existe uma tentativa de emissão: consultar resultado antes de novo envio.");
 const ready=missing.length===0;
 return NextResponse.json({
  kind:"cte",environment:"production",cargoReference:preview.cargoReference,
  invoiceCount:preview.invoiceCount,freightValue:preview.freightValue,
  goodsValue:preview.goodsValue,ready,missing,canTransmit:ready,
  notice:ready?
   "Conferência pronta. Para enviar à SEFAZ, abra Revisar / enviar e confirme expressamente. Esta consulta NÃO transmite.":
   "Conferência somente leitura. Corrija as pendências em Revisar / enviar. Nenhum documento foi transmitido.",
 },{headers:{"Cache-Control":"no-store"}});
}
