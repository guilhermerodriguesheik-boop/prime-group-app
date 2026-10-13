import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime="nodejs";
export const maxDuration=60;
const banks={
  itau:{label:"Itaú Empresas",kind:"prime",accountKind:"business"},
  bradesco:{label:"Bradesco Empresas",kind:"prime",accountKind:"business"},
  inter:{label:"Inter Pessoal",kind:"personal",accountKind:"personal"},
} as const;
function field(source:string,tag:string){
  const pattern=new RegExp("<"+tag+">\\s*([^<\\r\\n]+)","i");
  return source.match(pattern)?.[1]?.trim()||"";
}
function parseOfx(raw:string){
  if(!raw.includes("<OFX") || raw.length>2_300_000)throw new Error("Este arquivo não é OFX válido.");
  const blocks=[...raw.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi)];
  if(!blocks.length)throw new Error("OFX sem movimentações STMTTRN.");
  if(blocks.length>5000)throw new Error("Extrato grande demais; selecione um período menor.");
  const result:{id:string;date:string;amount:number;description:string}[]=[];
  for(const match of blocks){
    const content=match[1];
    const id=field(content,"FITID");
    const date=field(content,"DTPOSTED").slice(0,8);
    const amount=Number(field(content,"TRNAMT").replace(",","."));
    if(!id || id.length>150 || !/^[A-Za-z0-9_.:-]+$/.test(id))
      throw new Error("Extrato sem identificadores FITID seguros para evitar duplicação.");
    if(!/^\d{8}$/.test(date))throw new Error("Data inválida no OFX.");
    const dateStr=date.slice(0,4)+"-"+date.slice(4,6)+"-"+date.slice(6,8);
    if(Number.isNaN(new Date(dateStr+"T12:00:00Z").getTime()))
      throw new Error("Data inválida no OFX.");
    if(!Number.isFinite(amount) || Math.abs(amount)>1_000_000_000)
      throw new Error("Valor inválido no OFX.");
    const desc=field(content,"MEMO")||field(content,"NAME")||"Movimentação";
    result.push({id,date:dateStr,amount,description:desc.slice(0,350)});
  }
  const balanceRaw=field(raw,"BALAMT").replace(",",".");
  const balance=balanceRaw && Number.isFinite(Number(balanceRaw))?Number(balanceRaw):null;
  const balanceDate=field(raw,"DTASOF").slice(0,8);
  return {
    transactions:result,
    balance,accountLast4:field(raw,"ACCTID").replace(/\D/g,"").slice(-4)||null,
    balanceDate:/^\d{8}$/.test(balanceDate)?
      balanceDate.slice(0,4)+"-"+balanceDate.slice(4,6)+"-"+balanceDate.slice(6,8):null,
  };
}
export async function POST(req:Request){
  const origin=req.headers.get("origin");
  if(origin&&origin!==new URL(req.url).origin)
    return NextResponse.json({error:"Origem inválida."},{status:403});
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Faça login."},{status:401});
  if(Number(req.headers.get("content-length")||0)>2_500_000)
    return NextResponse.json({error:"Arquivo maior que 2 MB."},{status:413});
  let form:FormData;
  try{form=await req.formData();}catch{return NextResponse.json({error:"Arquivo inválido."},{status:400});}
  const bankKey=form.get("bank");
  const file=form.get("file");
  if(typeof bankKey!=="string"||!(bankKey in banks)||!(file instanceof File))
    return NextResponse.json({error:"Escolha o banco e o OFX."},{status:400});
  if(file.size>2_000_000||!/\.(ofx|qfx)$/i.test(file.name))
    return NextResponse.json({error:"Envie um arquivo .ofx de até 2 MB."},{status:400});
  const spec=banks[bankKey as keyof typeof banks];
  const {data:workspace}=await supabase.from("workspaces")
    .select("id,kind").eq("owner_id",user.id).eq("kind",spec.kind).limit(1).maybeSingle();
  if(!workspace)return NextResponse.json({error:"Cadastre o ambiente Prime/Pessoal antes."},{status:403});
  let parsed:ReturnType<typeof parseOfx>;
  try{
    const bytes=await file.arrayBuffer();
    const prefix=Buffer.from(bytes).subarray(0,400).toString("ascii");
    const charset=/ENCODING:USASCII|CHARSET:1252|ENCODING:ASCII|CHARSET:ISO-8859-1/i.test(prefix)
      ?"windows-1252":"utf-8";
    parsed=parseOfx(new TextDecoder(charset).decode(bytes));
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Não foi possível ler OFX."},{status:400});}
  const db=supabase as unknown as SupabaseClient;
  const itemId="manual:"+bankKey+":"+user.id;
  const {data:conn,error:connError}=await db.from("bank_connections").upsert({
    owner_id:user.id,workspace_id:workspace.id,provider:"manual",
    provider_item_id:itemId,display_name:spec.label,
    institution_name:spec.label,account_kind:spec.accountKind,status:"connected",
    last_synced_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString(),
  },{onConflict:"provider,provider_item_id"}).select("id").single();
  if(connError||!conn)return NextResponse.json({error:"Falha ao criar conta de importação."},{status:500});
  const now=new Date().toISOString();
  const {data:account,error:accountError}=await db.from("bank_accounts").upsert({
    owner_id:user.id,workspace_id:workspace.id,connection_id:conn.id,
    provider_account_id:"manual:"+bankKey,display_name:spec.label,
    kind:"BANK",account_last4:parsed.accountLast4,currency:"BRL",
    balance:parsed.balance,balance_updated_at:parsed.balanceDate?parsed.balanceDate+"T12:00:00Z":null,
    updated_at:now,
  },{onConflict:"connection_id,provider_account_id"}).select("id").single();
  if(accountError||!account)return NextResponse.json({error:"Falha ao registrar conta."},{status:500});
  for(let offset=0;offset<parsed.transactions.length;offset+=150){
    const chunk=parsed.transactions.slice(offset,offset+150).map(t=>({
      owner_id:user.id,workspace_id:workspace.id,bank_account_id:account.id,
      provider_transaction_id:t.id,occurred_on:t.date,
      description:t.description,amount:Math.abs(t.amount),
      direction:t.amount<0?"debit":"credit",provider_status:"POSTED",
      updated_at:now,
    }));
    const {error}=await db.from("bank_transactions").upsert(chunk,{onConflict:"bank_account_id,provider_transaction_id"});
    if(error)return NextResponse.json({error:"Erro ao importar lote bancário."},{status:500});
  }
  return NextResponse.json({ok:true,imported:parsed.transactions.length,bank:spec.label},{
    headers:{"Cache-Control":"no-store"}
  });
}
