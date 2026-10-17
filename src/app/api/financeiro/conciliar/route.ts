import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function bad(message:string,status=400){return NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});}
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)return bad("Origem não autorizada.",403);
 if(!req.headers.get("content-type")?.startsWith("application/json"))return bad("Formato inválido.");
 if(Number(req.headers.get("content-length")||0)>2500)return bad("Requisição grande demais.");
 let body:Record<string,unknown>;
 try{body=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error();}
 catch{return bad("Solicitação inválida.");}
 const action=body.action;
 const bankId=body.bankTransactionId;
 if((action!=="confirm"&&action!=="undo")||typeof bankId!=="string"||!uuid.test(bankId))
  return bad("Dados inválidos.");
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user)return bad("Faça login.",401);
 const {data:bank,error:bankError}=await db.from("bank_transactions")
  .select("id,workspace_id,owner_id,amount,direction,provider_status,review_status")
  .eq("id",bankId).eq("owner_id",user.id).maybeSingle();
 if(bankError||!bank)return bad("Movimentação bancária não localizada.",404);
 const {data:ws}=await db.from("workspaces").select("id,kind")
  .eq("id",bank.workspace_id).eq("owner_id",user.id).maybeSingle();
 if(!ws||!["prime","personal"].includes(ws.kind))return bad("Ambiente inválido.",403);
 if(action==="undo"){
  const {data,error}=await db.from("prime_bank_bill_matches").delete()
   .eq("bank_transaction_id",bankId).eq("owner_id",user.id).select("bank_transaction_id").maybeSingle();
  if(error)return bad("Não foi possível desfazer esta conciliação. Confira se houve edição da conta.",409);
  if(!data)return bad("Vínculo não encontrado.",404);
  return NextResponse.json({ok:true,undone:true},{headers:{"Cache-Control":"no-store"}});
 }
 const targetId=body.billId,kind=body.kind;
 if(typeof targetId!=="string"||!uuid.test(targetId)||(kind!=="payable"&&kind!=="receivable"))
  return bad("Selecione uma conta válida.");
 if(bank.provider_status!=="POSTED"||bank.review_status!=="pending"||
    (kind==="payable"&&bank.direction!=="debit")||
    (kind==="receivable"&&bank.direction!=="credit"))
  return bad("O movimento não está disponível para este tipo de conta.",409);
 const table=kind==="payable"?"payables":"receivables";
 const {data:bill,error:billError}=await db.from(table)
  .select(kind==="payable"?"id,workspace_id,amount,paid_amount,status":"id,workspace_id,amount,received_amount,status")
  .eq("id",targetId).eq("workspace_id",ws.id).maybeSingle();
 if(billError||!bill)return bad("Conta não encontrada no mesmo ambiente.",404);
 const settled=Number("paid_amount" in bill?bill.paid_amount:bill.received_amount);
 const pending=Number(bill.amount)-settled;
 if(pending<=0||Number(bank.amount)>pending+.005)return bad("O movimento excede o saldo pendente da conta.",409);
 // O trigger no banco aplica a mesma validação com trava e atualiza ambas as tabelas
 // em uma única transação. Mesmo em dois cliques concorrentes não duplica a baixa.
 const {error}=await db.from("prime_bank_bill_matches").insert({
  bank_transaction_id:bank.id,workspace_id:ws.id,owner_id:user.id,
  bill_kind:kind,bill_id:targetId,amount:Number(bank.amount),
 });
 if(error)return bad("Não foi possível conciliar: verifique valor, situação e se já existe vínculo.",409);
 return NextResponse.json({ok:true,matched:true},{headers:{"Cache-Control":"no-store"}});
}
