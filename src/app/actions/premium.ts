"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const txt=(f:FormData,key:string)=>String(f.get(key)||"").trim();
const decimal=(s:string)=>Number(s.includes(",")?s.replace(/\./g,"").replace(",","."):s);
const number=(raw:string)=>{const n=decimal(raw);if(!raw||!Number.isFinite(n)||n<0||n>100000000)throw Error("Valor inválido.");return n;};
const asDate=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+"T12:00:00Z")))throw Error("Data inválida.");return s;};
async function session(){
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user}}=await db.auth.getUser();
 if(!user)throw Error("Faça login.");
 return {db,user};
}
async function workspace(db:SupabaseClient,userId:string,kind:string){
 if(!["prime","personal"].includes(kind))throw Error("Área inválida.");
 const {data,error}=await db.from("workspaces").select("id").eq("owner_id",userId).eq("kind",kind).limit(1).maybeSingle();
 if(error||!data)throw Error("Ambiente não autorizado.");
 return data.id as string;
}
export async function saveRecurringBill(f:FormData){
 const {db,user}=await session();
 const kind=txt(f,"workspace"),ws=await workspace(db,user.id,kind);
 const id=txt(f,"id"),description=txt(f,"description").slice(0,180);
 const amount=number(txt(f,"amount")),day=Number(txt(f,"due_day"));
 const starts_on=asDate(txt(f,"starts_on"));
 const ends_on=txt(f,"ends_on")?asDate(txt(f,"ends_on")):null;
 if(description.length<2||!Number.isInteger(day)||day<1||day>31)throw Error("Informe descrição e dia de vencimento.");
 if(ends_on&&ends_on<starts_on)throw Error("Data final anterior ao início.");
 const cp=txt(f,"counterparty_id")||null;
 if(cp){
  if(!uuid.test(cp))throw Error("Pessoa inválida.");
  const {data:c}=await db.from("counterparties").select("id").eq("id",cp).eq("workspace_id",ws).maybeSingle();
  if(!c)throw Error("Credor não pertence a esse ambiente.");
 }
 const values={workspace_id:ws,description,amount,due_day:day,starts_on,ends_on,counterparty_id:cp,
  active:txt(f,"active")!=="no",updated_at:new Date().toISOString()};
 if(id){
  if(!uuid.test(id))throw Error("Cadastro inválido.");
  const {error}=await db.from("prime_recurring_bills").update(values).eq("id",id).eq("workspace_id",ws);
  if(error)throw Error(error.message);
 }else{
  const {error}=await db.from("prime_recurring_bills").insert(values);
  if(error)throw Error(error.message);
 }
 revalidatePath("/recorrentes");revalidatePath("/prime");revalidatePath("/pessoal");
}
export async function toggleRecurringBill(f:FormData){
 const {db,user}=await session(),kind=txt(f,"workspace"),ws=await workspace(db,user.id,kind);
 const id=txt(f,"id");if(!uuid.test(id))throw Error("Registro inválido.");
 const enabled=txt(f,"enabled")==="yes";
 const {error}=await db.from("prime_recurring_bills").update({active:enabled,updated_at:new Date().toISOString()})
   .eq("id",id).eq("workspace_id",ws);
 if(error)throw Error(error.message);
 revalidatePath("/recorrentes");
}
export async function saveCrewAssignment(f:FormData){
 const {db,user}=await session(),ws=await workspace(db,user.id,"prime");
 const id=txt(f,"id"),tripId=txt(f,"trip_id"),workerId=txt(f,"worker_id");
 if(!uuid.test(tripId)||!uuid.test(workerId))throw Error("Frete ou profissional inválido.");
 const role=txt(f,"role");if(!["driver","helper"].includes(role))throw Error("Tipo de profissional inválido.");
 const amount=number(txt(f,"amount"));
 const [{data:trip},{data:worker}]=await Promise.all([
  db.from("trips").select("id").eq("id",tripId).eq("workspace_id",ws).maybeSingle(),
  db.from("counterparties").select("id").eq("id",workerId).eq("workspace_id",ws).maybeSingle(),
 ]);
 if(!trip||!worker)throw Error("Frete e profissional devem pertencer à Prime.");
 const values={trip_id:tripId,worker_id:workerId,role,amount,notes:txt(f,"notes").slice(0,160)||null};
 if(id){
  if(!uuid.test(id))throw Error("Registro inválido.");
  const {error}=await db.from("prime_trip_workers").update(values).eq("id",id).eq("trip_id",tripId);
  if(error)throw Error(error.message);
 }else{
  const {error}=await db.from("prime_trip_workers").insert(values);
  if(error)throw Error(error.message);
 }
 revalidatePath("/equipes");revalidatePath("/viagens");
}
export async function removeCrewAssignment(f:FormData){
 const {db,user}=await session(),ws=await workspace(db,user.id,"prime");
 const id=txt(f,"id");if(!uuid.test(id)||txt(f,"confirm")!=="EXCLUIR")throw Error("Confirmação inválida.");
 const {data:assignment}=await db.from("prime_trip_workers").select("id,trip_id").eq("id",id).maybeSingle();
 if(!assignment)throw Error("Item não encontrado.");
 const {data:trip}=await db.from("trips").select("id").eq("id",assignment.trip_id).eq("workspace_id",ws).maybeSingle();
 if(!trip)throw Error("Sem autorização.");
 const {error}=await db.from("prime_trip_workers").delete().eq("id",id);
 if(error)throw Error(error.message);
 revalidatePath("/equipes");revalidatePath("/viagens");
}
export async function savePremiumNotifications(f:FormData){
 const {db,user}=await session();
 const keys=["bank_alerts","weekly_reports","monthly_reports"] as const;
 const value:Record<string,unknown>={user_id:user.id,updated_at:new Date().toISOString()};
 const payload:Record<string,unknown>={...value};
 for(const key of keys)payload[key]=f.get(key)==="on";
 const {error}=await db.from("prime_notification_settings").upsert(payload,{onConflict:"user_id"});
 if(error)throw Error(error.message);
 revalidatePath("/configuracoes");revalidatePath("/relatorios");
}
export async function classifyBankMovement(f:FormData){
 const {db,user}=await session();
 const transaction=txt(f,"id");
 const destination=txt(f,"destination");
 if(!uuid.test(transaction)||!["prime","personal","interest","transfer","pending"].includes(destination))
   throw Error("Classificação inválida.");
 const {data:t}=await db.from("bank_transactions").select("id").eq("id",transaction).eq("owner_id",user.id).maybeSingle();
 if(!t)throw Error("Movimentação não encontrada.");
 const {error}=await db.from("prime_bank_classifications").upsert({
  bank_transaction_id:transaction,user_id:user.id,destination,
  category:txt(f,"category").slice(0,80)||null,classified_at:new Date().toISOString(),
 },{onConflict:"bank_transaction_id"});
 if(error)throw Error(error.message);
 revalidatePath("/bancos");revalidatePath("/prime");revalidatePath("/pessoal");
}
