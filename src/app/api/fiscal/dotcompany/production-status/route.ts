import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {checkDotCompanyProduction,checkPrimeEmitterReadiness} from "@/lib/fiscal/dotcompany-production";
export const runtime="nodejs";
export const maxDuration=30;
export async function GET(){
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:"Entre no Prime Finance."},{status:401});
 const {data:ws}=await client.from("workspaces").select("id")
  .eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 if(!ws)return NextResponse.json({error:"Ambiente Prime não encontrado."},{status:403});
 const result=await checkDotCompanyProduction(
  process.env.DOTCOMPANY_PRODUCTION_API_KEY,
  process.env.DOTCOMPANY_CTE_LIVE_ENABLED==="true",
 );
 const issuer=result.authenticated?
  await checkPrimeEmitterReadiness(process.env.DOTCOMPANY_PRODUCTION_API_KEY):null;
 return NextResponse.json({...result,issuer},{headers:{"Cache-Control":"no-store"}});
}
