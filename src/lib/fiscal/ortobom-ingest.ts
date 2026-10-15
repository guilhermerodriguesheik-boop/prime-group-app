import {createClient} from "@supabase/supabase-js";
import {parseAuthorizedNfeXml} from "@/lib/fiscal/nfe";
import {parseOrtobomEmail} from "@/lib/fiscal/ortobom-email";
type EmailLoad={messageId:string;subject:string;body:string;xmls:{filename:string;content:string}[]};
export async function ingestOrtobomEmail(load:EmailLoad){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const workspaceId=process.env.ORTOBOM_WORKSPACE_ID;
 if(!url||!key||!workspaceId)throw new Error("Gmail import not configured.");
 const info=parseOrtobomEmail(load.subject,load.body);
 if(!info.verifiedOrtobom||!info.cargoReference||!info.freightValue||!info.ciot)
  throw new Error("Email does not contain a valid Ortobom cargo, CIOT and freight.");
 const files=load.xmls;
 if(!files.length||files.length>30)throw new Error("Invalid invoice count.");
 const invoices=files.map(file=>{
  if(!file.filename.toLowerCase().endsWith(".xml")||file.content.length>1048576)
   throw new Error("Invalid XML attachment.");
  const n=parseAuthorizedNfeXml(file.content);
  if(n.senderCnpj!=="14294395000278"||
     (n.cargoReference&&n.cargoReference!==info.cargoReference))
   throw new Error("Mismatched invoice issuer/cargo.");
  return {n,xml:file.content};
 });
 if(new Set(invoices.map(({n})=>n.accessKey)).size!==invoices.length)
   throw new Error("Repeated invoice keys.");
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:workspace,error:workspaceError}=await admin.from("workspaces")
  .select("id,owner_id").eq("id",workspaceId).eq("kind","prime").maybeSingle();
 if(workspaceError||!workspace?.owner_id)throw new Error("Workspace owner not configured.");
 const {data:existing,error:lookupError}=await admin.from("fiscal_drafts")
  .select("id").eq("workspace_id",workspaceId).eq("document_type","cte")
  .eq("cargo_reference",info.cargoReference).neq("status","canceled").limit(1).maybeSingle();
 if(lookupError)throw new Error("Unable to inspect existing fiscal drafts.");
 if(existing)return {status:"already_imported",cargo:info.cargoReference,count:invoices.length};
 const invoiceIds:string[]=[];
 for(const {n,xml} of invoices){
  const {data:found,error:findError}=await admin.from("fiscal_nfe_inbox")
   .select("id").eq("workspace_id",workspaceId).eq("access_key",n.accessKey).maybeSingle();
  if(findError)throw new Error("Invoice lookup unavailable.");
  if(found){invoiceIds.push(found.id);continue;}
  const {data:inserted,error:insertError}=await admin.from("fiscal_nfe_inbox").insert({
   workspace_id:workspaceId,created_by:workspace.owner_id,source_kind:"gmail",
   source_id:load.messageId,access_key:n.accessKey,invoice_number:n.invoiceNumber,
   invoice_series:n.invoiceSeries,issued_at:n.issuedAt,sender_name:n.senderName,
   sender_cnpj:n.senderCnpj,recipient_name:n.recipientName,recipient_cnpj:n.recipientCnpj,
   origin_city:n.originCity,origin_uf:n.originUf,destination_city:n.destinationCity,
   destination_uf:n.destinationUf,goods_value:n.goodsValue,
   gross_weight_kg:n.grossWeightKg,package_quantity:n.packageQuantity,
   cargo_reference:info.cargoReference,xml_content:xml
  }).select("id").single();
  if(insertError||!inserted)throw new Error("Invoice storage failed.");
  invoiceIds.push(inserted.id);
 }
 const {error:insertDraftError}=await admin.from("fiscal_drafts").insert({
  workspace_id:workspaceId,created_by:workspace.owner_id,
  document_type:"cte",status:"draft",nfe_id:invoiceIds[0],
  cargo_reference:info.cargoReference,ciot:info.ciot,freight_value:info.freightValue,
  checklist:{source:"gmail_ortobom",gmail_message_id:load.messageId,
   invoice_keys:invoices.map(({n})=>n.accessKey),invoice_ids:invoiceIds,
   invoice_count:invoiceIds.length,fiscal_approval:false,issue_environment:"none",
   note:"Importado automaticamente; conferir emissao historica antes de emitir."}
 });
 if(insertDraftError)throw new Error("Draft creation failed.");
 return {status:"imported",cargo:info.cargoReference,count:invoiceIds.length};
}
