import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {primeRpc,runPrimeOutbox} from "@/lib/whatsapp/prime-automations";
import {evolutionGoCapabilityCheck} from "@/lib/whatsapp/evolution-go-diagnostics";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request){
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)
  return NextResponse.json({error:"Origem não autorizada"},{status:403});
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user)return NextResponse.json({error:"Faça login"},{status:401});
 try{
  const info=await primeRpc<{ok:boolean;id?:string;reason?:string;status?:string}>(
   "prime_queue_bank_button_test",{p_owner_id:user.id});
  if(!info.ok||!info.id)return NextResponse.json({error:info.reason||"Não foi possível criar cartão de teste"},{status:409});
  const capabilities=await evolutionGoCapabilityCheck();
  if(info.status!=="sent")await runPrimeOutbox(2);
  const {data:outbox,error}=await db.from("prime_outbox").select("status,sent_at,last_error")
   .eq("id",info.id).eq("user_id",user.id).maybeSingle();
  if(error)return NextResponse.json({error:"Falha ao consultar entrega"},{status:503});
  return NextResponse.json({ok:true,status:outbox?.status||"pending",capabilities,
    providerError:outbox?.status==="retry"||outbox?.status==="failed"?
       String(outbox?.last_error||"Não foi possível enviar").slice(0,160):null,
    // A successful HTTP send is not proof of rendering on the WhatsApp client.
    providerAccepted:outbox?.status==="sent",
    failed:outbox?.status==="failed"||outbox?.status==="retry",
  },{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  console.error("Bank buttons test unavailable",error instanceof Error?error.message:"unknown");
  return NextResponse.json({error:"Não foi possível disparar o cartão interativo"},{status:503});
 }
}
