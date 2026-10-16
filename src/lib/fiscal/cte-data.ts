import "server-only";
import {createClient} from "@/lib/supabase/server";
import {ctePreview,productionKey,type CteDraft,type CteInvoice,type CteDriver,type CteVehicle,type CteProfile} from "@/lib/fiscal/cte-confirm";
import type {SupabaseClient} from "@supabase/supabase-js";
export async function session(){
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
  db.from("fiscal_transport_profiles").select("rntrc,rntrc_checked_at,cte_defaults").eq("workspace_id",workspaceId).maybeSingle(),
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
