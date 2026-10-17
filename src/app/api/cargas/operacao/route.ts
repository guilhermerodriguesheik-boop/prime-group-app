import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
export const runtime="nodejs";
type Payload={action?:unknown;cargo?:unknown;name?:unknown;service_date?:unknown;driver_id?:unknown;
 driver_pay?:unknown;driver_paid?:unknown;helper_count?:unknown;helper_rate?:unknown;helpers_paid?:unknown;
 diesel?:unknown;tolls?:unknown;other_expenses?:unknown;notes?:unknown;route_description?:unknown};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
function amount(v:unknown,max=1000000){
 if(typeof v!=="number"&&typeof v!=="string")return null;
 const s=String(v).trim();if(!/^\d+(?:[.,]\d{1,2})?$/.test(s))return null;
 const n=Number(s.replace(",","."));return Number.isFinite(n)&&n>=0&&n<=max?Math.round(n*100)/100:null;
}
export async function POST(req:Request){
 if(req.headers.get("origin")&&req.headers.get("origin")!==new URL(req.url).origin)return fail("Origem inválida.",403);
 if(!req.headers.get("content-type")?.startsWith("application/json"))return fail("Formato inválido.");
 if(Number(req.headers.get("content-length")||0)>6000)return fail("Requisição grande demais.");
 let p:Payload;try{p=JSON.parse(await req.text()) as Payload;}catch{return fail("Dados inválidos.");}
 if(!p||typeof p!=="object"||Array.isArray(p))return fail("Dados inválidos.");
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user}}=await db.auth.getUser();if(!user)return fail("Faça login.",401);
 const {data:w}=await db.from("workspaces").select("id").eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 if(!w)return fail("Ambiente Prime não localizado.",403);
 if(p.action==="driver"){
  const name=typeof p.name==="string"?p.name.trim():"";
  if(name.length<3||name.length>100)return fail("Nome do motorista inválido.");
  const {data,error}=await db.from("drivers").insert({workspace_id:w.id,name,active:true}).select("id,name").single();
  return error||!data?fail("Não foi possível cadastrar o motorista.",503):NextResponse.json({ok:true,driver:data});
 }
 if(p.action!=="save")return fail("Ação inválida.");
 const cargo=typeof p.cargo==="string"?p.cargo.replace(/\D/g,"").replace(/^0+(?=\d)/,""):"";
 if(!/^[1-9]\d{3,11}$/.test(cargo))return fail("Número da carga inválido.");
 const date=p.service_date===null||p.service_date===""?null:p.service_date;
 if(date!==null&&(typeof date!=="string"||!/^20\d\d-\d\d-\d\d$/.test(date)||
  Number.isNaN(new Date(date+"T12:00:00Z").getTime())||
  new Date(date+"T12:00:00Z").toISOString().slice(0,10)!==date))return fail("Data da carga inválida.");
 const driverId=p.driver_id===null||p.driver_id===""?null:p.driver_id;
 if(driverId!==null){
  if(typeof driverId!=="string"||!uuid.test(driverId))return fail("Motorista inválido.");
  const {data}=await db.from("drivers").select("id").eq("id",driverId)
   .eq("workspace_id",w.id).eq("active",true).maybeSingle();
  if(!data)return fail("Motorista não pertence ao ambiente Prime.",403);
 }
 const keys=["driver_pay","helper_rate","diesel","tolls","other_expenses"] as const;
 const costs:Record<string,number>={};
 for(const key of keys){const n=amount(p[key],key==="helper_rate"?100000:1000000);
  if(n===null)return fail("Valor inválido: "+key);costs[key]=n;}
 const helpers=Number(p.helper_count);
 if(!Number.isInteger(helpers)||helpers<0||helpers>30)return fail("Quantidade de ajudantes inválida.");
 if(typeof p.driver_paid!=="boolean"||typeof p.helpers_paid!=="boolean")return fail("Status de pagamento inválido.");
 if(p.driver_paid&&(!driverId||!costs.driver_pay))return fail("Motorista e valor obrigatórios para marcar pago.");
 if(p.helpers_paid&&(!helpers||!costs.helper_rate))return fail("Ajuda e valor obrigatórios para marcar pago.");
 if(typeof p.notes!=="string"||typeof p.route_description!=="string")return fail("Campos de texto inválidos.");
 const notes=p.notes.trim(),route=p.route_description.trim();
 if(notes.length>300||route.length>160)return fail("Observação ou rota muito longa.");
 const {error}=await db.from("prime_cargo_operations").upsert({
  workspace_id:w.id,cargo_reference:cargo,service_date:date,driver_id:driverId,
  driver_paid:p.driver_paid,helper_count:helpers,helpers_paid:p.helpers_paid,
  notes,route_description:route,...costs,updated_at:new Date().toISOString()
 },{onConflict:"workspace_id,cargo_reference"});
 return error?fail("Erro ao salvar informações da carga.",503):NextResponse.json({ok:true});
}
