import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {checkAnttSnapshot} from "@/lib/fiscal/antt-snapshot";
export const runtime="nodejs";
export const maxDuration=30;
export async function GET(){
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:"Acesso restrito."},{status:401});
 const {data:ws}=await client.from("workspaces").select("id")
  .eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 if(!ws)return NextResponse.json({error:"Ambiente não encontrado."},{status:403});
 const db=client as unknown as SupabaseClient;
 const {data:profile}=await db.from("fiscal_transport_profiles").select("rntrc")
  .eq("workspace_id",ws.id).maybeSingle();
 if(!profile?.rntrc)return NextResponse.json({error:"RNTRC não cadastrado."},{status:409});
 const check=await checkAnttSnapshot(profile.rntrc,"42361401000117");
 if(check.matched){
  const {error}=await db.from("fiscal_transport_profiles").update({
   rntrc_snapshot_checked_at:new Date().toISOString(),
   rntrc_snapshot_period:check.period,rntrc_snapshot_status:check.status,
   rntrc_snapshot_company:check.name,
  }).eq("workspace_id",ws.id).eq("rntrc",profile.rntrc);
  if(error)return NextResponse.json({...check,saveError:"Resultado público obtido, mas não salvo."},
   {headers:{"Cache-Control":"no-store"}});
 }
 return NextResponse.json(check,{headers:{"Cache-Control":"no-store"}});
}
