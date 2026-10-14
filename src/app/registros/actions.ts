"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
const text=(f:FormData,k:string)=>typeof f.get(k)==="string"?String(f.get(k)).trim():"";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function savePartialRecord(form:FormData){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)throw Error("Faça login.");
 const id=text(form,"record_id"),subject=text(form,"subject"),original=text(form,"original_text");
 const workspaceId=text(form,"workspace_id");
 if(subject.length<2||subject.length>200||original.length<2||original.length>10000)throw Error("Preencha assunto e conteúdo.");
 if(workspaceId){
   if(!uuid.test(workspaceId))throw Error("Ambiente inválido.");
   const {data:w}=await db.from("workspaces").select("id").eq("id",workspaceId).eq("owner_id",user.id).maybeSingle();
   if(!w)throw Error("Ambiente não autorizado.");
 }
 if(id){
   if(!uuid.test(id))throw Error("Registro inválido.");
   const {data:row}=await db.from("partial_records").select("id,status").eq("id",id).eq("user_id",user.id).maybeSingle();
   if(!row||row.status!=="open")throw Error("Anotação indisponível.");
   const {error}=await db.from("partial_records").update({
     subject,original_text:original,workspace_id:workspaceId||null,
     updated_at:new Date().toISOString(),
   }).eq("id",id).eq("user_id",user.id);
   if(error)throw Error(error.message);
 }else{
   const {error}=await db.from("partial_records").insert({
     user_id:user.id,workspace_id:workspaceId||null,subject,original_text:original,
     record_kind:"other",status:"open",
   });
   if(error)throw Error(error.message);
 }
 revalidatePath("/registros");revalidatePath("/");
 return {ok:true};
}
export async function archivePartialRecord(form:FormData){
 const id=text(form,"record_id");
 if(!uuid.test(id)||text(form,"confirm")!=="EXCLUIR")throw Error("Confirmação inválida.");
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)throw Error("Faça login.");
 const {error}=await db.from("partial_records").update({status:"archived",updated_at:new Date().toISOString()})
   .eq("id",id).eq("user_id",user.id).eq("status","open");
 if(error)throw Error(error.message);
 revalidatePath("/registros");return {ok:true};
}
