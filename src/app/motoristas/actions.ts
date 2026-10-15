"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {validCpf,normalizeDigits} from "@/lib/fiscal/preflight";
export async function registerPrimeDriver(data:FormData):Promise<void>{
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)throw new Error("Faça login para cadastrar motoristas.");
 const {data:ws,error:wsError}=await supabase.from("workspaces").select("id")
  .eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 if(wsError||!ws)throw new Error("Ambiente Prime indisponivel.");
 const name=String(data.get("name")||"").trim().slice(0,150);
 const document=normalizeDigits(String(data.get("document")||""));
 const phone=normalizeDigits(String(data.get("phone")||""));
 const license=normalizeDigits(String(data.get("license_number")||""));
 const expires=String(data.get("license_expires_on")||"").trim();
 if(name.length<3||!validCpf(document))throw new Error("Informe nome e CPF validos.");
 if(phone&&phone.length<10)throw new Error("Numero de telefone invalido.");
 if(expires&&!/^\d{4}-\d{2}-\d{2}$/.test(expires))throw new Error("Data de vencimento invalida.");
 const {data:existing}=await supabase.from("drivers").select("id")
  .eq("workspace_id",ws.id).eq("document",document).limit(1).maybeSingle();
 if(existing)throw new Error("Motorista com esse CPF ja foi cadastrado.");
 const {error}=await supabase.from("drivers").insert({
  workspace_id:ws.id,name,document,phone:phone||null,
  license_number:license||null,license_expires_on:expires||null,active:true,
 });
 if(error)throw new Error("Nao foi possivel salvar o motorista.");
 revalidatePath("/motoristas");
 revalidatePath("/fiscal");
}
