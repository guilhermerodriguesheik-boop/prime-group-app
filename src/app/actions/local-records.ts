"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAccount,createCard,createCounterparty,createLoan,createPayable,createReceivable,
  createRecurringEntry,createTransaction,createVehicle,
} from "@/app/cadastros/actions";

const kinds=["transaction","payable","receivable","account","card","vehicle","trip","counterparty","recurring","reminder","loan","document"] as const;
type Kind=typeof kinds[number];
const wsKinds=["prime","personal","interest"] as const;
const fields:Record<Kind,readonly string[]>={
  transaction:["description","amount","type","occurred_at"],
  payable:["description","amount","due_date"],
  receivable:["description","amount","due_date"],
  account:["name","institution","account_type","opening_balance"],
  card:["name","issuer","last4","closing_day","due_day","credit_limit"],
  vehicle:["nickname","plate","make","model","year","odometer_km","estimated_value","status"],
  trip:["customer_name","origin","destination","driver_name","service_date","freight_revenue","driver_cost","distance_km","reference","status"],
  counterparty:["name","kind","phone","email","document"],
  recurring:["name","type","amount","frequency","due_day","starts_on","ends_on"],
  reminder:["description","amount","due_date"],
  loan:["maturity_date","notes"],
  document:["filename","document_type"],
};
const sourceTable:Record<Kind,string>={
 transaction:"transactions",payable:"payables",receivable:"receivables",account:"accounts",card:"cards",
 vehicle:"vehicles",trip:"trips",counterparty:"counterparties",recurring:"recurring_entries",
 reminder:"payment_reminders",loan:"loans",document:"documents",
};
const numeric=new Set(["amount","opening_balance","credit_limit","closing_day","due_day","year",
 "odometer_km","estimated_value","freight_revenue","driver_cost","distance_km"]);
const options:Record<string,readonly string[]>={
 type:["income","expense"],account_type:["checking","savings","cash","other"],
 status:["active","inactive"],frequency:["monthly","weekly","quarterly","yearly"],
 kind:["customer","supplier","borrower","lender","driver","other"],
};
function txt(data:FormData,k:string){const v=data.get(k);return typeof v==="string"?v.trim():"";}
function numericValue(raw:string){const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function parseDate(raw:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||isNaN(Date.parse(raw+"T12:00:00Z")))throw Error("Data inválida.");return raw;}
async function authorized(kind:string){
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user}}=await db.auth.getUser();
 if(!user)throw Error("Faça login.");
 if(!wsKinds.includes(kind as typeof wsKinds[number]))throw Error("Ambiente inválido.");
 const {data:workspace,error}=await db.from("workspaces").select("id,kind").eq("kind",kind).eq("owner_id",user.id).limit(1).maybeSingle();
 if(error||!workspace)throw Error("Ambiente não autorizado.");
 return {db,user,workspace};
}
function invalid(message:string):never{throw Error(message)}
const refresh=()=>["/documentos","/registros","/","/prime","/pessoal","/contas","/juros","/frota","/viagens","/planejamento","/relatorios","/cadastros"].forEach(x=>revalidatePath(x));
export async function saveLocalRecord(formData:FormData){
 const category=txt(formData,"category") as Kind;
 const workspace=txt(formData,"workspace");
 const rowId=txt(formData,"record_id");
 if(!kinds.includes(category))invalid("Cadastro inválido.");
 const {db,user,workspace:w}=await authorized(workspace);
 if(rowId&&!/^[0-9a-f-]{36}$/i.test(rowId))invalid("Registro inválido.");
 if(!rowId){
   formData.set("workspace",workspace);
   if(category==="transaction"){
     formData.set("entry_mode",txt(formData,"entry_mode")||txt(formData,"type")||"expense");
     if(!txt(formData,"occurred_at"))formData.set("occurred_at",new Date().toISOString().slice(0,10));
     await createTransaction(formData);
   }else if(category==="account")await createAccount(formData);
   else if(category==="card")await createCard(formData);
   else if(category==="payable")await createPayable(formData);
   else if(category==="receivable")await createReceivable(formData);
   else if(category==="vehicle"){
     if(workspace!=="prime")invalid("Veículos só podem ser cadastrados na Prime.");
     await createVehicle(formData);
   }else if(category==="counterparty")await createCounterparty(formData);
   else if(category==="recurring")await createRecurringEntry(formData);
   else if(category==="loan"){
     if(workspace!=="interest")invalid("Contratos devem ser cadastrados em Juros.");
     await createLoan(formData);
   }else if(category==="trip"){
     if(workspace!=="prime")invalid("Fretes devem pertencer à Prime.");
     const values={
       workspace_id:w.id,
       customer_name:txt(formData,"customer_name")||null,
       origin:txt(formData,"origin")||null,destination:txt(formData,"destination")||null,
       driver_name:txt(formData,"driver_name")||null,
       service_date:txt(formData,"service_date")?parseDate(txt(formData,"service_date")):null,
       freight_revenue:txt(formData,"freight_revenue")?numericValue(txt(formData,"freight_revenue")):null,
       driver_cost:txt(formData,"driver_cost")?numericValue(txt(formData,"driver_cost")):null,
       status:"planned",
     };
     if(values.freight_revenue!==null&&(!Number.isFinite(values.freight_revenue)||values.freight_revenue<0))invalid("Valor de frete inválido.");
     const {error}=await db.from("trips").insert(values);if(error)throw Error(error.message);
   }else if(category==="document"){
     invalid("Envie documentos pela seção Documentos.");
   }else if(category==="reminder"){
     const due=parseDate(txt(formData,"due_date"));
     const remindDate=new Date(due+"T12:00:00Z");remindDate.setUTCDate(remindDate.getUTCDate()-3);
     const amount=txt(formData,"amount")?numericValue(txt(formData,"amount")):null;
     if(amount!==null&&(!Number.isFinite(amount)||amount<0))invalid("Valor inválido.");
     const {error}=await db.from("payment_reminders").insert({
       user_id:user.id,workspace_id:w.id,description:txt(formData,"description"),
       due_date:due,remind_on:remindDate.toISOString().slice(0,10),amount,status:"pending",
     });if(error)throw Error(error.message);
   }
   refresh();return {ok:true};
 }
 const table=sourceTable[category];
 const {data:previous,error:loadError}=await db.from(table).select("*").eq("id",rowId)
   .eq("workspace_id",w.id).maybeSingle();
 if(loadError||!previous)invalid("Registro não encontrado neste ambiente.");
 if(category==="transaction"&&(previous.source!=="manual"||previous.status==="reconciled"))
   invalid("Lançamentos de empréstimos ou conciliados devem ser corrigidos pelo fluxo financeiro.");
 if(category==="loan"){
   if(previous.status!=="draft"||previous.disbursement_transaction_id)invalid("Somente contratos planejados podem ser editados.");
   const {count,error:paymentError}=await db.from("loan_payments").select("id",{count:"exact",head:true}).eq("loan_id",rowId);
   if(paymentError||count)invalid("Contrato com pagamentos não pode ser editado diretamente.");
 }
 if(category==="payable"||category==="receivable"){
   const paid=Number(category==="payable"?previous.paid_amount:previous.received_amount)||0;
   const next=numericValue(txt(formData,"amount"));
   if(!(next>=paid)&&Number.isFinite(next))invalid("Valor não pode ser menor que o já liquidado.");
 }
 const patch:Record<string,unknown>={};
 for(const field of fields[category]){
   const raw=txt(formData,field);
   if(["description","name","nickname"].includes(field)&&!raw)invalid("Informe o nome ou descrição.");
   if(field==="status"){
     const allowed=category==="vehicle"?options.status:["planned","in_progress","completed","cancelled"];
   if(!["vehicle","trip"].includes(category)||!allowed.includes(raw))invalid("Situação inválida.");
   }else if(options[field]&&!options[field].includes(raw))invalid("Opção inválida.");
   if(field.endsWith("_date")||field==="starts_on"||field==="ends_on"||field==="occurred_at"||field==="maturity_date"||field==="service_date"){
     if(raw)parseDate(raw);
     patch[field]=raw?(field==="occurred_at"?raw+"T12:00:00-03:00":raw):null;
   }else if(numeric.has(field)){
     if(!raw){patch[field]=null;continue}
     const n=numericValue(raw);
     if(!Number.isFinite(n)||n<0)invalid("Valor inválido em "+field);
     patch[field]=n;
   }else patch[field]=raw||null;
 }
 if(category==="transaction" && (patch.type!=="income"&&patch.type!=="expense")){
   invalid("Apenas receita e despesa manual podem ser editadas.");
 }
 if(category==="reminder"){
   const due=String(patch.due_date);
   const remindDate=new Date(due+"T12:00:00Z");remindDate.setUTCDate(remindDate.getUTCDate()-3);
   patch.remind_on=remindDate.toISOString().slice(0,10);
   if(previous.status!=="pending")invalid("Só é possível editar lembretes pendentes.");
 }
 const {error}=await db.from(table).update(patch).eq("id",rowId).eq("workspace_id",w.id);
 if(error)throw Error(error.message);
 refresh();return {ok:true};
}
export async function removeLocalRecord(formData:FormData){
 const category=txt(formData,"category") as Kind;
 const workspace=txt(formData,"workspace");
 const id=txt(formData,"record_id");
 if(!kinds.includes(category)||!/^[0-9a-f-]{36}$/i.test(id))invalid("Registro inválido.");
 const {db,workspace:w,user}=await authorized(workspace);
 const table=sourceTable[category];
 const {data:row,error}=await db.from(table).select("*").eq("workspace_id",w.id).eq("id",id).maybeSingle();
 if(error||!row)invalid("Registro não encontrado.");
 if(txt(formData,"confirm")!=="EXCLUIR")invalid("Confirme a exclusão.");
 if(category==="document"){
   if(row.related_id)invalid("Documento vinculado a um registro financeiro não pode ser excluído.");
   const {data:removed,error:removeError}=await db.from("documents").delete().eq("id",id).eq("workspace_id",w.id).select("id").maybeSingle();
   if(removeError||!removed)invalid("Não foi possível excluir o documento.");
   const {error:storageError}=await db.storage.from("documents").remove([String(row.storage_path)]);
   if(storageError)invalid("Cadastro apagado, mas a remoção do arquivo do armazenamento falhou.");
   revalidatePath("/documentos");return {ok:true};
 }
 if(category==="counterparty"){
   // Referential SET NULL would silently erase names from historical receivables/trips.
   for(const [table,column] of [
     ["loans","counterparty_id"],["payables","counterparty_id"],
     ["receivables","counterparty_id"],["transactions","counterparty_id"],
     ["maintenance","vendor_id"],["trips","customer_id"],
   ] as const){
     const {count,error:linkedError}=await db.from(table).select("id",{count:"exact",head:true}).eq(column,id);
     if(linkedError||count)invalid("Pessoa vinculada a históricos financeiros. Edite os dados, mas não exclua o cadastro.");
   }
 }
 if(category==="trip"){
   for(const table of ["transactions","fuel_logs","tolls","cte_documents"] as const){
     const {count,error:linkedError}=await db.from(table).select("id",{count:"exact",head:true}).eq("trip_id",id);
     if(linkedError||count)invalid("Frete com movimentações ou documentos relacionados. Cancele pela situação sem excluir seu histórico.");
   }
 }
 if(category==="transaction"&&(row.source!=="manual"||row.status==="reconciled"))invalid("Lançamento vinculado: use o estorno contábil.");
 if(category==="payable"&&Number(row.paid_amount)>0)invalid("Conta com pagamento não pode ser excluída. Faça o estorno primeiro.");
 if(category==="receivable"&&Number(row.received_amount)>0)invalid("Recebível com recebimento não pode ser excluído. Faça o estorno primeiro.");
 if(category==="loan"){
   const {count,error:paymentError}=await db.from("loan_payments").select("id",{count:"exact",head:true}).eq("loan_id",id);
   if(row.status!=="draft"||row.disbursement_transaction_id||paymentError||count)invalid("Contrato movimentado não pode ser excluído; preserve o histórico.");
 }
 let errorOut:null|{message:string}=null;
 const soft:Record<string,unknown>|null=
   category==="transaction"||category==="payable"||category==="receivable"||category==="loan"?{status:"cancelled"}:
   category==="account"||category==="card"||category==="recurring"?{active:false}:
   category==="vehicle"?{status:"inactive"}:
   category==="reminder"?{status:"done"}:null;
 if(soft){
   const result=await db.from(table).update(soft).eq("id",id).eq("workspace_id",w.id);
   errorOut=result.error;
 }else{
   const result=await db.from(table).delete().eq("id",id).eq("workspace_id",w.id);
   errorOut=result.error;
 }
 if(errorOut)throw Error(errorOut.message||"Há registros vinculados; não é seguro excluir.");
 if(category==="reminder"){
   // Closing a reminder must never settle a payable or receivable.
   await db.from("payment_reminders").update({updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id);
 }
 refresh();return {ok:true};
}
export async function setWhatsappReminderPreference(formData:FormData){
 const {db,user}=await authorized("personal");
 const enabled=txt(formData,"enabled")==="yes";
 if(enabled){
   const {data:pair}=await db.from("whatsapp_pairings")
     .select("user_id").eq("user_id",user.id).eq("enabled",true).not("connected_at","is",null).maybeSingle();
   if(!pair)invalid("Vincule primeiro seu número na área Integrações.");
 }
 const {error}=await db.from("whatsapp_reminder_preferences").upsert({
    user_id:user.id,enabled,updated_at:new Date().toISOString(),
 },{onConflict:"user_id"});
 if(error)throw Error(error.message);
 revalidatePath("/planejamento");
}
