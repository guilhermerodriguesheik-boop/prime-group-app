import "server-only";
import {NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";

export const runtime="nodejs";
const err=(error:string,status=400)=>NextResponse.json({error},{status:status,headers:{"Cache-Control":"no-store"}});
const uuid=z.string().uuid();
const day=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(v=>new Date(v+"T12:00:00Z").toISOString().slice(0,10)===v);
const optDay=day.nullable();
const positive=z.number().int().min(1).max(50000).nullable();
const status=z.enum(["a_conferir","aguardando_coleta","coletado","em_rota","entregue","ocorrencia","devolvido","cancelado"]);
const stage=z.enum(["faturado_no_piso","aguardando_faturamento"]);
const docType=z.enum(["NF","Pedido"]);
const text=(max:number)=>z.string().trim().max(max);
const item=z.object({
 romaneio:z.string().trim().regex(/^\d{3,14}$/),document_number:text(40),
 document_kind:docType,carrier:text(160),recipient:z.string().trim().min(2).max(200),
 neighborhood:text(100),source_stage:stage,declared_volumes:positive,
});
const update=z.object({
 action:z.literal("update"),id:uuid,document_number:text(40),document_kind:docType,
 carrier:text(160),recipient:z.string().trim().min(2).max(200),neighborhood:text(100),
 source_stage:stage,declared_volumes:positive,collected_volumes:positive,
 delivered_volumes:positive,delivery_status:status,
 arrived_on:optDay,collected_on:optDay,departed_on:optDay,delivered_on:optDay,
 accounted_on:optDay,unit_rate:z.number().min(0).max(100000).nullable(),
 driver_name:text(120),proof_reference:text(240),notes:text(1000)
});
const batch=z.object({action:z.literal("import"),account_name:z.string().trim().min(2).max(100),
 report_received_on:optDay,source_filename:text(180),rows:z.array(z.unknown()).min(1).max(120)});
const close=z.object({action:z.literal("close"),account_name:z.string().trim().min(2).max(100),
 week_start:day,week_end:day,invoice_date:day,ids:z.array(uuid).min(1).max(500)});
function brToday(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
async function authorized(){
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user)return null;
 const {data:w,error}=await db.from("workspaces").select("id").eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 if(error||!w)return null;
 return {db,workspaceId:w.id,userId:user.id};
}
const sameOrigin=(req:Request)=>!req.headers.get("origin")||req.headers.get("origin")===new URL(req.url).origin;
export async function GET(){
 const ctx=await authorized();if(!ctx)return err("Faça login na Prime.",401);
 const {data,error}=await ctx.db.from("prime_delivery_orders")
  .select("*").eq("workspace_id",ctx.workspaceId).order("created_at",{ascending:false}).limit(2500);
 if(error)return err("Banco de entregas indisponível. Confirme a migração SQL.",503);
 return NextResponse.json({orders:data||[]},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:Request){
 if(!sameOrigin(req))return err("Origem inválida.",403);
 if(!req.headers.get("content-type")?.startsWith("application/json"))return err("Formato inválido.");
 if(Number(req.headers.get("content-length")||0)>160000)return err("Solicitação muito grande.");
 const ctx=await authorized();if(!ctx)return err("Faça login na Prime.",401);
 let data:unknown;try{data=await req.json()}catch{return err("JSON inválido.");}
 if(!data||typeof data!=="object"||Array.isArray(data))return err("Dados inválidos.");
 const action=(data as {action?:unknown}).action;
 if(action==="import"){
  const p=batch.safeParse(data);if(!p.success)return err("Revise contratante, data e lista de pedidos.");
  const account=p.data.account_name.toUpperCase();
  const valid:typeof item._type[]=[],invalid:number[]=[];
  p.data.rows.forEach((row,i)=>{const checked=item.safeParse(row);if(checked.success)valid.push(checked.data);else invalid.push(i+1)});
  if(invalid.length)return err("Corrija as linhas sem romaneio ou dados válidos antes de importar: "+invalid.join(", "));
  const unique=new Map<string,typeof item._type>();for(const row of valid)unique.set(row.romaneio,row);
  const rows=[...unique.values()];
  const {data:already,error:existingError}=await ctx.db.from("prime_delivery_orders")
   .select("romaneio").eq("workspace_id",ctx.workspaceId).eq("account_name",account)
   .in("romaneio",rows.map(x=>x.romaneio));
  if(existingError)return err("Não foi possível verificar romaneios repetidos.",503);
  const known=new Set((already||[]).map(x=>String(x.romaneio)));
  const fresh=rows.filter(x=>!known.has(x.romaneio));
  if(fresh.length){
   const {error:saveError}=await ctx.db.from("prime_delivery_orders").insert(fresh.map(row=>({
    ...row,workspace_id:ctx.workspaceId,created_by:ctx.userId,account_name:account,
    report_received_on:p.data.report_received_on,source_filename:p.data.source_filename,
    delivery_status:"a_conferir",collected_volumes:null,delivered_volumes:null,
   })));
   if(saveError){
    if(saveError.code==="23505")return err("Outro envio inseriu um romaneio igual. Atualize a página e confira.",409);
    return err("Não foi possível salvar a lista: "+saveError.message,503);
   }
  }
  return NextResponse.json({ok:true,created:fresh.length,duplicates:rows.length-fresh.length+valid.length-rows.length});
 }
 if(action==="close"){
  const p=close.safeParse(data);if(!p.success)return err("Dados do fechamento semanal inválidos.");
  const dates=new Date(p.data.week_start+"T12:00:00Z");
  if(dates.getUTCDay()!==1 || new Date(dates.getTime()+6*86400000).toISOString().slice(0,10)!==p.data.week_end)
   return err("A semana precisa começar segunda-feira e terminar domingo.");
  const {data:count,error}=await ctx.db.rpc("prime_close_delivery_week",{
   p_account_name:p.data.account_name.toUpperCase(),p_start:p.data.week_start,
   p_end:p.data.week_end,p_ids:p.data.ids,p_invoiced_on:p.data.invoice_date,
  });
  if(error)return err("Fechamento não realizado: "+error.message,409);
  return NextResponse.json({ok:true,count});
 }
 return err("Ação não reconhecida.");
}
export async function PATCH(req:Request){
 if(!sameOrigin(req))return err("Origem inválida.",403);
 if(!req.headers.get("content-type")?.startsWith("application/json"))return err("Formato inválido.");
 if(Number(req.headers.get("content-length")||0)>10000)return err("Registro muito grande.");
 const ctx=await authorized();if(!ctx)return err("Faça login.",401);
 const p=update.safeParse(await req.json().catch(()=>null));
 if(!p.success)return err("Campos inválidos. Confira volumes, valores e datas.");
 const {id,action,...patch}=p.data;
 const today=brToday();
 if(patch.delivery_status==="coletado"&&!patch.collected_on)patch.collected_on=today;
 if(patch.delivery_status==="em_rota"&&!patch.departed_on)patch.departed_on=today;
 if(patch.delivery_status==="entregue"&&!patch.delivered_on)patch.delivered_on=today;
 // Encerramento fiscal e prestação de contas só são liberados pela validação do banco.
 const {data,error}=await ctx.db.from("prime_delivery_orders").update(patch)
  .eq("workspace_id",ctx.workspaceId).eq("id",id).is("invoiced_on",null).select("id").maybeSingle();
 if(error)return err(error.message,409);
 if(!data)return err("Pedido não encontrado ou já faturado.",409);
 return NextResponse.json({ok:true});
}
