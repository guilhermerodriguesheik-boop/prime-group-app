import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {dotcompanyHealth,sandboxConfigured,DotCompanyError} from "@/lib/fiscal/dotcompany";
export const runtime="nodejs";
export async function GET(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Faça login no Prime Finance."},{status:401});
 const {data:ws}=await supabase.from("workspaces").select("id")
  .eq("owner_id",user.id).eq("kind","prime").maybeSingle();
 if(!ws)return NextResponse.json({error:"Ambiente Prime não localizado."},{status:404});
 const key=process.env.DOTCOMPANY_SANDBOX_API_KEY;
 if(!sandboxConfigured(key))return NextResponse.json({configured:false,connected:false,
  reason:"Chave DotCompany Sandbox ausente ou inválida."},{status:503,headers:{"Cache-Control":"no-store"}});
 try{
  const result=await dotcompanyHealth(key);
  return NextResponse.json({configured:true,connected:true,environment:"sandbox",
   provider:"DotCompany",httpStatus:result.status,
   // Sem detalhes de conta, chaves ou resposta bruta do fornecedor.
   message:"Autenticação da API confirmada pela consulta de consumo."},
   {headers:{"Cache-Control":"no-store"}});
 }catch(e){
  const error=e instanceof DotCompanyError?e.code:"NETWORK_UNAVAILABLE";
  return NextResponse.json({configured:true,connected:false,environment:"sandbox",reason:error},
   {status:502,headers:{"Cache-Control":"no-store"}});
 }
}
