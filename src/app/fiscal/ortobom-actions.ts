"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {parseAuthorizedNfeXml} from "@/lib/fiscal/nfe";
import {parseOrtobomEmail} from "@/lib/fiscal/ortobom-email";
import type {SupabaseClient} from "@supabase/supabase-js";
export type CargoImportState={ok:boolean;message:string};
const fail=(message:string):CargoImportState=>({ok:false,message});
export async function importOrtobomCargo(_previous:CargoImportState,form:FormData):Promise<CargoImportState>{
 try{
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return fail("Entre na sua conta.");
 const {data:ws}=await db.from("workspaces").select("id").eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 if(!ws)return fail("Ambiente Prime indisponivel.");
 const subject=String(form.get("subject")||"").slice(0,200);
 const body=String(form.get("body")||"").slice(0,12000);
 const info=parseOrtobomEmail(subject,body);
 if(!info.cargoReference||!info.freightValue||!info.ciot)return fail("Confira carga, valor e CIOT no email.");
 const xmls=form.getAll("xmls").filter((f):f is File=>f instanceof File&&f.size>0);
 if(!xmls.length||xmls.length>30||xmls.some(f=>!f.name.toLowerCase().endsWith(".xml")||f.size>1024*1024))
  return fail("Envie de 1 a 30 XMLs individuais com ate 1MB.");
 const notes=[];
 for(const file of xmls){
   const xml=await file.text();const n=parseAuthorizedNfeXml(xml);
   if(n.senderCnpj!=="14294395000278")return fail("Uma nota nao e da Ortobom de Queimados.");
   if(n.cargoReference&&n.cargoReference!==info.cargoReference)return fail("As notas pertencem a cargas diferentes.");
   notes.push({n,xml});
 }
 if(new Set(notes.map(x=>x.n.accessKey)).size!==notes.length)return fail("Existem notas repetidas.");
 const client=db as unknown as SupabaseClient;
 const {data:existing}=await client.from("fiscal_drafts").select("id").eq("workspace_id",ws.id)
  .eq("document_type","cte").eq("cargo_reference",info.cargoReference).neq("status","canceled").limit(1).maybeSingle();
 if(existing)return {ok:true,message:"Carga ja cadastrada; nenhum frete duplicado."};
 const ids:string[]=[];
 for(const {n,xml} of notes){
   const {data:prior}=await client.from("fiscal_nfe_inbox").select("id").eq("workspace_id",ws.id).eq("access_key",n.accessKey).maybeSingle();
   if(prior){ids.push(prior.id);continue;}
   const {data:saved,error}=await client.from("fiscal_nfe_inbox").insert({
     workspace_id:ws.id,created_by:user.id,source_kind:"manual",access_key:n.accessKey,
     invoice_number:n.invoiceNumber,invoice_series:n.invoiceSeries,issued_at:n.issuedAt,
     sender_name:n.senderName,sender_cnpj:n.senderCnpj,recipient_name:n.recipientName,
     recipient_cnpj:n.recipientCnpj,origin_city:n.originCity,origin_uf:n.originUf,
     destination_city:n.destinationCity,destination_uf:n.destinationUf,
     goods_value:n.goodsValue,gross_weight_kg:n.grossWeightKg,
     package_quantity:n.packageQuantity,cargo_reference:info.cargoReference,xml_content:xml
   }).select("id").single();
   if(error||!saved)return fail("Falha ao gravar NF-e "+n.invoiceNumber+".");
   ids.push(saved.id);
 }
 const {error}=await client.from("fiscal_drafts").insert({
  workspace_id:ws.id,created_by:user.id,document_type:"cte",status:"draft",
  nfe_id:ids[0],cargo_reference:info.cargoReference,ciot:info.ciot,
  freight_value:info.freightValue,
  checklist:{source:"ortobom_email",invoice_ids:ids,invoice_keys:notes.map(x=>x.n.accessKey),
    invoice_count:ids.length,fiscal_approval:false,issue_environment:"none"}
 });
 if(error)return fail("Notas guardadas; o CT-e precisa ser revisado.");
 revalidatePath("/fiscal");
 return {ok:true,message:"Carga "+info.cargoReference+": "+ids.length+" NF-e(s) e frete unico de R$ "+info.freightValue.toFixed(2)+"; rascunho criado."};
 }catch(error){console.error("Ortobom batch error",error instanceof Error?error.message:"unknown");return fail("Confira os XMLs e os dados da carga.");}
}
