import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {canPrepareNewCte} from "@/lib/fiscal/preflight";
import {sandboxConfigured} from "@/lib/fiscal/dotcompany";
import type {SupabaseClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)return NextResponse.json({error:"Origem inválida."},{status:403});
 if(req.headers.get("x-prime-action")!=="dotcompany-preflight")return NextResponse.json({error:"Requisição inválida."},{status:403});
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Entre no aplicativo."},{status:401});
 const {data:ws}=await supabase.from("workspaces").select("id")
  .eq("owner_id",user.id).eq("kind","prime").maybeSingle();
 if(!ws)return NextResponse.json({error:"Ambiente Prime não encontrado."},{status:404});
 const body=await req.json().catch(()=>null) as {draftId?:unknown}|null;
 if(typeof body?.draftId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.draftId))
  return NextResponse.json({error:"Rascunho inválido."},{status:400});
 const db=supabase as unknown as SupabaseClient;
 const {data:record}=await db.from("fiscal_drafts")
  .select("id,status,document_type,cargo_reference,freight_value,checklist")
  .eq("id",body.draftId).eq("workspace_id",ws.id).eq("document_type","cte").maybeSingle();
 if(!record)return NextResponse.json({error:"Rascunho não encontrado."},{status:404});
 const missing:string[]=[];
 if(!canPrepareNewCte(record.status,record.checklist))
  missing.push("Já existe indicação de emissão externa ou o CT-e não está em rascunho; verificar duplicidade antes de qualquer emissão.");
 const cargo=record.cargo_reference;
 const [{data:notes},{data:drivers},{data:vehicles},{data:profiles}]=await Promise.all([
  cargo?db.from("fiscal_nfe_inbox").select("access_key,goods_value,gross_weight_kg,origin_uf,destination_uf")
    .eq("workspace_id",ws.id).eq("cargo_reference",cargo).limit(60):Promise.resolve({data:[]}),
  db.from("drivers").select("id").eq("workspace_id",ws.id).eq("active",true).limit(1),
  db.from("vehicles").select("id").eq("workspace_id",ws.id).eq("status","active").limit(1),
  db.from("fiscal_transport_profiles").select("rntrc").eq("workspace_id",ws.id).limit(1),
 ]);
 if(!notes?.length)missing.push("NF-e da carga não localizada.");
 if(!drivers?.length)missing.push("Motorista ativo com CPF e CNH não cadastrado.");
 if(!vehicles?.length)missing.push("Veículo ativo não cadastrado.");
 if(!profiles?.[0]?.rntrc)missing.push("RNTRC válido ainda não registrado e verificado na ANTT.");
 missing.push("Confirmar CFOP, regime tributário, tomador, municípios IBGE e numeração fiscal da Prime.");
 missing.push("Cadastrar o certificado A1 e habilitar CT-e no emissor DotCompany Sandbox.");
 const configured=sandboxConfigured(process.env.DOTCOMPANY_SANDBOX_API_KEY);
 if(!configured)missing.push("Chave DotCompany Sandbox não configurada.");
 return NextResponse.json({
  kind:"cte",environment:"sandbox",cargoReference:cargo||null,
  invoiceCount:notes?.length||0,
  invoiceKeys:(notes||[]).map(x=>x.access_key),
  freightValue:record.freight_value===null?null:Number(record.freight_value),
  goodsValue:(notes||[]).reduce((sum,v)=>sum+Number(v.goods_value||0),0),
  ready:false,missing,canTransmit:false,
  notice:"Pré-conferência somente leitura. Nenhum CT-e foi assinado ou transmitido."
 },{headers:{"Cache-Control":"no-store"}});
}
