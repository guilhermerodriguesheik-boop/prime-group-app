import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {primeRpc,runPrimeOutbox} from "@/lib/whatsapp/prime-automations";

export const runtime="nodejs";
export const maxDuration=60;
const allowed=["imported_today","today","yesterday","last7"] as const;
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
  const queued=await primeRpc<{queued:boolean;id:string;status:string}>(
   "prime_queue_requested_bank_report",{p_owner_id:user.id,p_mode:mode});
  if(!queued.id)return output({error:"Não foi possível preparar o relatório."},503);
  let sendResult:unknown=null;
  // Explicit user action; process a bounded number of ready messages immediately.
  if(queued.status!=="sent"){
   for(let i=0;i<3;i++){
    sendResult=await runPrimeOutbox();
    const {data:current}=await db.from("prime_outbox").select("status,sent_at,last_error")
     .eq("id",queued.id).eq("user_id",user.id).maybeSingle();
    if(current?.status==="sent")return output({
     ok:true,reportId:queued.id,status:"sent",sentAt:current.sent_at
    });
    if(current?.status==="failed")return output({
     ok:false,reportId:queued.id,status:"failed",error:"A entrega falhou. Consulte o histórico do WhatsApp."
    },503);
    if(!sendResult||typeof sendResult!=="object"||
      !("claimed" in sendResult)||Number(sendResult.claimed)===0)break;
   }
  }
  const {data:state}=await db.from("prime_outbox").select("status,sent_at")
   .eq("id",queued.id).eq("user_id",user.id).maybeSingle();
  return output({ok:true,reportId:queued.id,status:state?.status||queued.status,sentAt:state?.sent_at||null});
 }catch(e){
  console.error("Requested bank report unavailable",e instanceof Error?e.message:"unknown");
  return output({error:"Não foi possível preparar ou enviar o relatório. Tente novamente."},503);
 }
}