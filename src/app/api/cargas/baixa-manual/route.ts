import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
export const runtime="nodejs";

type RequestBody={action?:unknown;cargo?:unknown;date?:unknown;amount?:unknown;note?:unknown};
const err=(message:string,status=400)=>NextResponse.json({error:message},{status});
function validMoney(value:unknown){
 if(typeof value!=="number"&&typeof value!=="string")return null;
 const raw=String(value).trim();
 if(!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(raw))return null;
 const amount=Number(raw.replace(",","."));
 return Number.isFinite(amount)&&amount>0&&amount<=1000000?Math.round(amount*100)/100:null;
}
function validDate(date:unknown):date is string{
 if(typeof date!=="string"||!/^20\d{2}-\d{2}-\d{2}$/.test(date))return false;
 const parsed=new Date(date+"T12:00:00Z");
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",
  year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date
  &&date<=""+today;
}
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)return err("Origem inválida.",403);
 if(!req.headers.get("content-type")?.startsWith("application/json"))return err("Formato inválido.");
 if(Number(req.headers.get("content-length")||0)>3000)return err("Dados muito grandes.");
 let body:RequestBody;
 try{body=JSON.parse(await req.text()) as RequestBody;}catch{return err("Dados inválidos.");}
 if(!body||typeof body!=="object"||Array.isArray(body))return err("Dados inválidos.");
 if(body.action!=="settle"&&body.action!=="undo")return err("Ação inválida.");
 const cargo=typeof body.cargo==="string"?body.cargo.replace(/\D/g,"").replace(/^0+(?=\d)/,""):"";
 if(!/^[1-9]\d{3,11}$/.test(cargo))return err("Número da carga inválido.");
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user)return err("Faça login.",401);
 const {data:workspace,error:wsError}=await db.from("workspaces").select("id")
  .eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 if(wsError||!workspace)return err("Ambiente Prime não encontrado.",403);
 if(body.action==="undo"){
  const {data,error}=await db.from("prime_cargo_operations").update({
   manual_settled_on:null,manual_settled_amount:null,manual_settled_at:null,
   manual_settlement_note:"",manual_settled_by:null,updated_at:new Date().toISOString(),
  }).eq("workspace_id",workspace.id).eq("cargo_reference",cargo)
   .not("manual_settled_on","is",null).select("id");
  if(error)return err("Não foi possível desfazer a baixa manual.",503);
  if(!data?.length)return err("Não há baixa manual para desfazer.",404);
  return NextResponse.json({ok:true,manual:false},{headers:{"Cache-Control":"no-store"}});
 }
 if(!validDate(body.date))return err("Informe uma data válida de recebimento, até hoje.");
 const value=validMoney(body.amount);
 if(value===null)return err("Informe o valor recebido, maior que zero.");
 if(typeof body.note!=="string"||body.note.trim().length>300)return err("Observação inválida (máximo 300 caracteres).");

 // Não permitir registrar baixa em um número arbitrário sem carga importada.
 const [draft,report]=await Promise.all([
  db.from("fiscal_drafts").select("id,freight_value").eq("workspace_id",workspace.id)
   .eq("document_type","cte").eq("cargo_reference",cargo).limit(1).maybeSingle(),
  db.from("ortobom_financial_emails")
   .select("id,ortobom_financial_lines!inner(cargo_reference,declared_freight)")
   .eq("workspace_id",workspace.id)
   .eq("ortobom_financial_lines.cargo_reference",cargo).limit(1).maybeSingle(),
 ]);
 if(draft.error||report.error)return err("Não foi possível verificar a carga.",503);
 if(!draft.data&&!report.data)return err("Carga não localizada nos registros importados.",404);
 // A baixa não altera motorista, ajudantes, combustível ou outras despesas
 // que estejam salvas na mesma carga.
 const manualChange={
  manual_settled_on:body.date,manual_settled_amount:value,
  manual_settled_at:new Date().toISOString(),manual_settled_by:user.id,
  manual_settlement_note:body.note.trim(),updated_at:new Date().toISOString(),
 };
 const {data:current,error:checkError}=await db.from("prime_cargo_operations").select("id")
  .eq("workspace_id",workspace.id).eq("cargo_reference",cargo).maybeSingle();
 if(checkError)return err("Não foi possível verificar a baixa existente.",503);
 const response=current?
  await db.from("prime_cargo_operations").update(manualChange)
   .eq("workspace_id",workspace.id).eq("cargo_reference",cargo):
  await db.from("prime_cargo_operations").insert({
   workspace_id:workspace.id,cargo_reference:cargo,...manualChange,
  });
 if(response.error)return err("Não foi possível registrar o recebimento manual.",503);
 return NextResponse.json({ok:true,manual:true},{headers:{"Cache-Control":"no-store"}});
}
