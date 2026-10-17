import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {primeRpc,runPrimeOutbox} from "@/lib/whatsapp/prime-automations";

export const runtime="nodejs";
export const maxDuration=60;
const allowed=["imported_today","today","yesterday","yesterday_today","last7"] as const;
type Mode=(typeof allowed)[number];
function output(body:unknown,status=200){
 return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:Request){
 if(req.headers.get("origin")&&req.headers.get("origin")!==new URL(req.url).origin)
  return output({error:"Origem inválida."},403);
 if(!req.headers.get("content-type")?.startsWith("application/json"))return output({error:"Formato inválido."},415);
 if(Number(req.headers.get("content-length")||0)>1000)return output({error:"Requisição grande demais."},413);
 let input:unknown;
 try{input=await req.json();}catch{return output({error:"Solicitação inválida."},400);}
 if(!input||typeof input!=="object"||Array.isArray(input))return output({error:"Solicitação inválida."},400);
 const mode=(input as Record<string,unknown>).mode;
 if(!allowed.includes(mode as Mode))return output({error:"Período inválido."},400);
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return output({error:"Faça login."},401);
 const {data:pair,error:pairError}=await db.from("whatsapp_pairings")
  .select("user_id,enabled,connected_at").eq("user_id",user.id).maybeSingle();
 if(pairError||!pair?.enabled||!pair.connected_at)
  return output({error:"Seu WhatsApp precisa estar vinculado e ativo."},409);
 try{
  const batch=await primeRpc<{
   ok:boolean;total:number;selected:number;queued:number;
   alreadyQueued:number;truncated:boolean;limit:number;batchPrefix:string
  }>("prime_queue_requested_bank_cards",{p_owner_id:user.id,p_mode:mode});
  if(!batch.ok)return output({error:"Não foi possível preparar os cartões."},503);
  if(batch.selected===0)return output({ok:true,total:0,queued:0,sent:0,pending:0,
   status:"empty",message:"Nenhum lançamento bancário disponível nesse período."});
  // Send a bounded first wave, leaving the remaining cards in the outbox for cron.
  await runPrimeOutbox(2);
  const {data:items,error:outboxError}=await db.from("prime_outbox")
   .select("status").eq("user_id",user.id)
   .like("dedupe_key",batch.batchPrefix+"%");
  if(outboxError)return output({error:"Os cartões foram enfileirados, mas o estado não pôde ser consultado."},503);
  const states=items||[];
  const sent=states.filter(x=>x.status==="sent").length;
  const failed=states.filter(x=>x.status==="failed"||x.status==="retry").length;
  const pending=states.filter(x=>x.status==="pending"||x.status==="processing").length;
  return output({
   ok:true,total:batch.total,selected:batch.selected,queued:batch.queued,
   sent,pending,failed,truncated:batch.truncated,
   status:failed>0?"retry":pending>0?"pending":sent===batch.selected?"sent":"pending",
   message:"Uma mensagem interativa por movimentação, cada uma com seus próprios botões."
  });
 }catch(e){
  console.error("Requested bank report unavailable",e instanceof Error?e.message:"unknown");
  return output({error:"Não foi possível preparar ou enviar o relatório. Tente novamente."},503);
 }
}