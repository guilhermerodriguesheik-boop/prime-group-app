import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {ctePreview,safeConfig,productionKey,type CteDraft,type CteInvoice,type CteDriver,type CteVehicle,type CteProfile} from "@/lib/fiscal/cte-confirm";
import type {SupabaseClient} from "@supabase/supabase-js";
export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function session(){
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return null;
 const {data:ws}=await client.from("workspaces").select("id")
  .eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 return ws?{db:client as unknown as SupabaseClient,workspaceId:ws.id,userId:user.id}:null;
}
export async function gather(workspaceId:string,db:SupabaseClient,draftId:string){
 const {data:draft,error}=await db.from("fiscal_drafts")
  .select("id,status,updated_at,cargo_reference,ciot,freight_value,checklist,vehicle_id,driver_id")
  .eq("workspace_id",workspaceId).eq("document_type","cte").eq("id",draftId).maybeSingle();
 if(error||!draft)return null;
 const [notesResult,driverResult,vehicleResult,profileResult,transResult]=await Promise.all([
  draft.cargo_reference?db.from("fiscal_nfe_inbox")
   .select("access_key,invoice_number,origin_uf,destination_uf,goods_value,gross_weight_kg")
   .eq("workspace_id",workspaceId).eq("cargo_reference",draft.cargo_reference).limit(41):
   Promise.resolve({data:[]}),
  draft.driver_id?db.from("drivers").select("id,name,document,active")
   .eq("workspace_id",workspaceId).eq("id",draft.driver_id).maybeSingle():Promise.resolve({data:null}),
  draft.vehicle_id?db.from("vehicles").select("id,plate,nickname,status")
   .eq("workspace_id",workspaceId).eq("id",draft.vehicle_id).maybeSingle():Promise.resolve({data:null}),
  db.from("fiscal_transport_profiles").select("rntrc,rntrc_checked_at").eq("workspace_id",workspaceId).maybeSingle(),
  db.from("fiscal_cte_transmissions").select("status,access_key,protocol,error_code")
   .eq("workspace_id",workspaceId).eq("draft_id",draftId).maybeSingle(),
 ]);
 const preview=ctePreview({
  draft:draft as CteDraft,notes:(notesResult.data||[]) as CteInvoice[],
  driver:driverResult.data as CteDriver|null,vehicle:vehicleResult.data as CteVehicle|null,
  profile:profileResult.data as CteProfile|null,
  configured:productionKey(process.env.DOTCOMPANY_PRODUCTION_API_KEY),
  liveEnabled:process.env.DOTCOMPANY_CTE_LIVE_ENABLED==="true",
  existingSubmission:!!transResult.data,
 });
 return {draft,preview,submission:transResult.data||null};
}
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
 if(r.draft.status!=="draft"||r.submission||r.draft.checklist?.do_not_issue_duplicate===true||
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
 return NextResponse.json({ok:true,message:"Dados salvos. Revise novamente antes de autorizar o envio."});
}
