"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeDigits, normalizePlate, validCpf } from "@/lib/fiscal/preflight";
import type { SupabaseClient } from "@supabase/supabase-js";
const platePattern=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
async function ctx(){
  const client=await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)throw Error("Faça login.");
  const {data:w}=await client.from("workspaces").select("id")
    .eq("kind","prime").eq("owner_id",user.id).maybeSingle();
  if(!w)throw Error("Ambiente Prime indisponível.");
  return {client:client as unknown as SupabaseClient,workspaceId:w.id};
}
function value(form:FormData,key:string){return String(form.get(key)||"").trim();}
export async function registerDriver(form:FormData) {
  const {client,workspaceId}=await ctx();
  const name=value(form,"name"),document=normalizeDigits(value(form,"cpf"));
  const license=value(form,"cnh");
  const expires=value(form,"cnhExpires");
  if(name.length<3||name.length>120||!validCpf(document))throw Error("Informe nome e CPF válidos.");
  if(license.length>40||(expires&&!/^\d{4}-\d{2}-\d{2}$/.test(expires)))
    throw Error("CNH ou validade inválida.");
  const {data:old,error:lookupError}=await client.from("drivers").select("id")
    .eq("workspace_id",workspaceId).eq("document",document).maybeSingle();
  if(lookupError)throw Error("Não foi possível consultar motorista.");
  const row={workspace_id:workspaceId,name,document,license_number:license||null,
    license_expires_on:expires||null,phone:normalizeDigits(value(form,"phone"))||null,active:true};
  const result=old ? await client.from("drivers").update(row).eq("id",old.id).eq("workspace_id",workspaceId)
    :await client.from("drivers").insert(row);
  if(result.error)throw Error("Não foi possível cadastrar motorista.");
  revalidatePath("/cadastros/transporte");revalidatePath("/fiscal");
}
export async function registerTransportVehicle(form:FormData){
  const {client,workspaceId}=await ctx();
  const plate=normalizePlate(value(form,"plate"));
  const nickname=value(form,"nickname"),model=value(form,"model"),make=value(form,"make");
  if(!platePattern.test(plate)||nickname.length<2||nickname.length>100)
    throw Error("Informe placa brasileira e apelido válidos.");
  if(make.length>80||model.length>80)throw Error("Marca ou modelo demasiado longo.");
  const {data:old,error:lookupError}=await client.from("vehicles").select("id")
    .eq("workspace_id",workspaceId).eq("plate",plate).maybeSingle();
  if(lookupError)throw Error("Erro ao verificar a placa.");
  const row={workspace_id:workspaceId,plate,nickname,make:make||null,model:model||null,status:"active"};
  const result=old ? await client.from("vehicles").update(row).eq("id",old.id).eq("workspace_id",workspaceId)
    :await client.from("vehicles").insert(row);
  if(result.error)throw Error("Não foi possível cadastrar veículo.");
  revalidatePath("/cadastros/transporte");revalidatePath("/fiscal");revalidatePath("/frota");
}
export async function saveTransportRntrc(form:FormData){
  const {client,workspaceId}=await ctx();
  const rntrc=normalizeDigits(value(form,"rntrc"));
  if(!/^\d{8,9}$/.test(rntrc))throw Error("Informe RNTRC com 8 ou 9 dígitos.");
  const {error}=await client.from("fiscal_transport_profiles").upsert({
    workspace_id:workspaceId,rntrc,rntrc_checked_at:null,rntrc_check_notes:null,
    updated_at:new Date().toISOString(),
  },{onConflict:"workspace_id"});
  if(error)throw Error("Banco regulatório não disponível; verifique a migração.");
  revalidatePath("/cadastros/transporte");revalidatePath("/fiscal");
}

/** Records a dated, user-attested official ANTT review. This does not call ANTT. */
export async function confirmTransportRntrcReview(form:FormData){
 const {client,workspaceId}=await ctx();
 const submitted=normalizeDigits(value(form,"rntrc"));
 if(form.get("checked")!=="yes"||!/^[0-9]{8,9}$/.test(submitted))
  throw Error("Abra a consulta oficial e marque a confirmação após verificar o registro.");
 const {data:profile,error:lookupError}=await client.from("fiscal_transport_profiles")
  .select("rntrc").eq("workspace_id",workspaceId).maybeSingle();
 if(lookupError||!profile||profile.rntrc!==submitted)
  throw Error("RNTRC diverge do cadastro; atualize e consulte a ANTT antes de prosseguir.");
 const {error}=await client.from("fiscal_transport_profiles").update({
  rntrc_checked_at:new Date().toISOString(),
  rntrc_check_notes:"Situação ATIVO declarada pelo proprietário após consulta ao portal ANTT. O aplicativo não verificou a informação automaticamente.",
  updated_at:new Date().toISOString(),
 }).eq("workspace_id",workspaceId).eq("rntrc",submitted);
 if(error)throw Error("Não foi possível registrar a conferência da ANTT.");
 revalidatePath("/cadastros/transporte");
 revalidatePath("/fiscal");
}
