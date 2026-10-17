import "server-only";
import {NextResponse} from "next/server";
import {safeConfig} from "@/lib/fiscal/cte-confirm";
import {gather,session} from "@/lib/fiscal/cte-data";
export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req:Request){
 const url=new URL(req.url);const id=url.searchParams.get("draftId")||"";
 if(!uuid.test(id))return NextResponse.json({error:"Rascunho inválido."},{status:400});
 const s=await session();
 if(!s)return NextResponse.json({error:"Entre com sua conta Prime."},{status:401});
 const [r,vehicles,drivers]=await Promise.all([
  gather(s.workspaceId,s.db,id),
  s.db.from("vehicles").select("id,nickname,plate,status")
   .eq("workspace_id",s.workspaceId).eq("status","active").limit(50),
  s.db.from("drivers").select("id,name,active")
   .eq("workspace_id",s.workspaceId).eq("active",true).limit(50),
 ]);
 if(!r)return NextResponse.json({error:"Rascunho não localizado."},{status:404});
 return NextResponse.json({
  preview:r.preview,submission:r.submission,
  draft:{vehicle_id:r.draft.vehicle_id,driver_id:r.draft.driver_id,status:r.draft.status},
  vehicles:vehicles.data||[],drivers:drivers.data||[],
 },{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)return NextResponse.json({error:"Origem inválida."},{status:403});
 if(req.headers.get("x-prime-action")!=="fiscal-cte-configure")
  return NextResponse.json({error:"Requisição inválida."},{status:403});
 const body=await req.json().catch(()=>null) as {draftId?:unknown;vehicleId?:unknown;driverId?:unknown;config?:unknown}|null;
 if(!body||typeof body.draftId!=="string"||!uuid.test(body.draftId))
  return NextResponse.json({error:"Rascunho inválido."},{status:400});
 const s=await session();
 if(!s)return NextResponse.json({error:"Entre no Prime Finance."},{status:401});
 const r=await gather(s.workspaceId,s.db,body.draftId);
 if(!r)return NextResponse.json({error:"Rascunho não encontrado."},{status:404});
 const mayEditPrevious= !r.submission ||
  (["indeterminate","rejected"].includes(r.submission.status) &&
   !r.submission.access_key&&!r.submission.protocol);
 if(r.draft.status!=="draft"||!mayEditPrevious||r.draft.checklist?.do_not_issue_duplicate===true||
    r.draft.checklist?.previous_external_cte_number)
  return NextResponse.json({error:"Esta carga está bloqueada para evitar reemissão de CT-e."},{status:409});
 if(typeof body.vehicleId!=="string"||!uuid.test(body.vehicleId)||
    typeof body.driverId!=="string"||!uuid.test(body.driverId))
  return NextResponse.json({error:"Selecione um veículo e um motorista cadastrados."},{status:400});
 const [vehicle,driver]=await Promise.all([
  s.db.from("vehicles").select("id").eq("workspace_id",s.workspaceId).eq("id",body.vehicleId).eq("status","active").maybeSingle(),
  s.db.from("drivers").select("id").eq("workspace_id",s.workspaceId).eq("id",body.driverId).eq("active",true).maybeSingle(),
 ]);
 if(!vehicle.data||!driver.data)return NextResponse.json({error:"Veículo ou motorista não está ativo."},{status:400});
 const config=safeConfig(body.config);
 const existing=r.draft.checklist&&typeof r.draft.checklist==="object"?r.draft.checklist:{};
 const {data:updated,error}=await s.db.from("fiscal_drafts").update({
  vehicle_id:body.vehicleId,driver_id:body.driverId,
  checklist:{...existing,cte_provider_config:config,fiscal_approval:false},
 }).eq("id",body.draftId).eq("workspace_id",s.workspaceId).eq("status","draft")
 .eq("updated_at",r.draft.updated_at).select("id").maybeSingle();
 if(error||!updated)return NextResponse.json({error:"O rascunho mudou. Reabra a revisão antes de salvar."},{status:409});
 // Store only reviewed reusable defaults; never reuse numbering approval.
 const {error:defaultError}=await s.db.from("fiscal_transport_profiles").upsert({
  workspace_id:s.workspaceId,
  cte_defaults:{
   cfop:config.cfop,tomador:config.tomador,produto_predominante:config.produto_predominante,
   uf_licenciamento:config.uf_licenciamento,
   origin_uf:r.preview.payload.uf_inicio,destination_uf:r.preview.payload.uf_fim,
  },
 },{onConflict:"workspace_id"});
 if(defaultError)return NextResponse.json({ok:true,message:"Dados salvos no CT-e. Não foi possível atualizar o modelo reutilizável; os dados da carga foram preservados."});
 return NextResponse.json({ok:true,message:"Dados salvos. Revise novamente antes de autorizar o envio."});
}
