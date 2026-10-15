import {generateText} from "ai";
import {openai} from "@ai-sdk/openai";
import {NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {chooseAiProfile} from "@/lib/ai/cost-routing";
import type {SupabaseClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export const maxDuration=60;
const schema=z.object({question:z.string().trim().min(3).max(1500)});
export async function POST(request:Request){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Faça login."},{status:401});
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:"Pergunta inválida."},{status:400});
 if(!process.env.OPENAI_API_KEY?.trim())
  return NextResponse.json({error:"A IA ainda não foi configurada no servidor."},{status:503});
 const {data:ws}=await supabase.from("workspaces").select("id")
  .eq("owner_id",user.id).eq("kind","prime").maybeSingle();
 if(!ws)return NextResponse.json({error:"Ambiente Prime não encontrado."},{status:404});
 const db=supabase as unknown as SupabaseClient;
 const [invoices,drafts,drivers,vehicles]=await Promise.all([
  db.from("fiscal_nfe_inbox").select("invoice_number,cargo_reference,recipient_name,origin_city,destination_city,goods_value")
   .eq("workspace_id",ws.id).order("created_at",{ascending:false}).limit(60),
  db.from("fiscal_drafts").select("document_type,cargo_reference,freight_value,ciot,status,checklist,created_at")
   .eq("workspace_id",ws.id).order("created_at",{ascending:false}).limit(60),
  db.from("drivers").select("name,active,license_expires_on")
   .eq("workspace_id",ws.id).limit(60),
  db.from("vehicles").select("nickname,plate,model,status")
   .eq("workspace_id",ws.id).limit(50),
 ]);
 if([invoices.error,drafts.error,drivers.error,vehicles.error].some(Boolean))
  return NextResponse.json({error:"Falha ao consultar cadastros."},{status:503});
 const data={
  invoices:invoices.data??[],freightDrafts:drafts.data??[],
  drivers:drivers.data??[],vehicles:vehicles.data??[],
 };
 try{
  const profile=chooseAiProfile({message:input.data.question,hasVisual:false});
  const response=await generateText({
   model:openai(profile.model),
   maxOutputTokens:650,timeout:40000,maxRetries:1,
   system:"Você é o assistente fiscal e de logística da Prime Group. Responda em português claro, com dados do banco, nunca invente CIOT, RNTRC, placa, CPF, autorização fiscal ou documentos. A soma do valor das mercadorias não é valor de frete. Uma carga pode ter muitas NF-e e um único frete. Rascunhos NÃO são CT-e/MDF-e autorizados. Se faltar um dado, diga que falta. Não execute emissão ou movimentações.",
   prompt:"PERGUNTA: "+input.data.question+"\nDADOS DO PRIME FINANCE (somente leitura): "+JSON.stringify(data),
  });
  return NextResponse.json({answer:response.text||"Nenhuma resposta produzida."},
   {headers:{"Cache-Control":"no-store"}});
 }catch(error){
  console.error("Fiscal AI unavailable",error instanceof Error?error.message:"unknown");
  return NextResponse.json({error:"IA temporariamente indisponível."},{status:503});
 }
}
