import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {personalBankUserAllowed} from "@/lib/banks/pluggy";
import {ensurePluggyWebhooks} from "@/lib/banks/webhook-setup";
export const runtime="nodejs";
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)return NextResponse.json({error:"Origem não autorizada."},{status:403});
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Faça login."},{status:401});
 if(!personalBankUserAllowed(user.id)||process.env.PLUGGY_PERSONAL_OWNER_ID!==user.id)
  return NextResponse.json({error:"Configuração exclusiva do proprietário."},{status:403});
 try{
  const result=await ensurePluggyWebhooks();
  const verified=result.configured===true&&result.verified===true;
  const {error:auditError}=await db.from("bank_connections").update({
   webhook_check_at:new Date().toISOString(),
   webhook_check_status:verified?"verified":"failed",
   webhook_check_error:verified?null:"A Pluggy não confirmou a inscrição.",
  }).eq("owner_id",user.id).eq("provider","pluggy").is("archived_at",null);
  if(auditError)console.error("Webhook audit write unavailable",auditError.code);
  return NextResponse.json({...result,auditRecorded:!auditError},
   {status:verified?200:503});
 }catch(err){
  return NextResponse.json({error:err instanceof Error?err.message:"Não foi possível configurar os eventos."},{status:502});
 }
}
