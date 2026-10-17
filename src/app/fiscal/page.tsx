import {Header} from "@/components/ui";
import Link from "next/link";
import {SimpleCargoTable,type CargoDisplay,type CargoDriver,type CargoOperation} from "@/components/fiscal/simple-cargo-table";
import {gmailStatus} from "@/lib/fiscal/gmail";
import {buildCargoLedger,type LedgerDraft,type LedgerEmail} from "@/lib/fiscal/simple-cargo-ledger";
import {applyManualBalanceReceipt} from "@/lib/fiscal/manual-balance";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {redirect} from "next/navigation";
export default async function FiscalPage({searchParams}:{searchParams:Promise<{gmail?:string;reason?:string}>}){
 const query=await searchParams;
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/login");
 const {data:ws}=await db.from("workspaces").select("id").eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 const gmail=ws?await gmailStatus(ws.id).catch(()=>null):null;
 const [drafts,emails,operations,drivers]=await Promise.all([
  ws?db.from("fiscal_drafts").select("cargo_reference,freight_value")
   .eq("workspace_id",ws.id).eq("document_type","cte").order("created_at",{ascending:true}).limit(2000):
   Promise.resolve({data:[],error:null}),
  ws?db.from("ortobom_financial_emails")
   .select("event_kind,email_date,ortobom_financial_lines(cargo_reference,declared_freight,declared_advance,declared_balance)")
   .eq("workspace_id",ws.id).order("email_date",{ascending:true}).limit(2000):
   Promise.resolve({data:[],error:null}),
  ws?db.from("prime_cargo_operations")
   .select("cargo_reference,service_date,route_description,driver_id,driver_pay,driver_paid,helper_count,helper_rate,helpers_paid,diesel,tolls,other_expenses,notes,manual_settled_on,manual_settled_amount,manual_settlement_note")
   .eq("workspace_id",ws.id).limit(2000):
   Promise.resolve({data:[],error:null}),
  ws?db.from("drivers").select("id,name,active,phone").eq("workspace_id",ws.id).order("name").limit(500):
   Promise.resolve({data:[],error:null}),
 ]);
 const reports=(emails.data||[]) as LedgerEmail[];
 const firstEmail=new Map<string,string>();
 for(const mail of reports){
  if(!mail.email_date)continue;
  for(const line of mail.ortobom_financial_lines||[]){
   const key=line.cargo_reference.replace(/\D/g,"").replace(/^0+(?=\d)/,"");
   if(key&&!firstEmail.has(key))firstEmail.set(key,mail.email_date.slice(0,10));
  }
 }
 const opMap=new Map<string,CargoOperation>();
 for(const op of (operations.data||[]) as CargoOperation[])opMap.set(op.cargo_reference,op);
 const cargo:CargoDisplay[]=buildCargoLedger((drafts.data||[]) as LedgerDraft[],reports).map(c=>{
  const key=c.cargo.replace(/^0+(?=\d)/,"");
  const operation=opMap.get(key)||null;
  return {...applyManualBalanceReceipt(c,operation),emailDate:firstEmail.get(key)||null,operation};
 });
 const missing=Boolean(drafts.error||emails.error||operations.error||drivers.error);
 return <>
  <Header title="Cargas e despesas" subtitle="Fretes, recebimentos e equipe em uma planilha"/>
  {query.gmail==="connection_failed"&&<div className="fiscal-alert fiscal-alert-error">Gmail não conectado: {query.reason||"tente novamente"}.</div>}
  {!ws&&<div className="fiscal-alert fiscal-alert-error">Ambiente Prime não encontrado.</div>}
  {missing&&<div className="fiscal-alert fiscal-alert-error">Algumas informações falharam. Atualize antes de considerar os totais.</div>}
  <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",margin:"12px 0 18px"}}>
   <span style={{fontSize:13}}>{gmail?"Gmail conectado":"Gmail não conectado"}</span>
   {!gmail&&<a className="button primary" href="/api/fiscal/gmail/connect">Conectar Gmail</a>}
   <Link className="button" href="/prime">Gestão Prime Group</Link>
   <Link className="button" href="/frota">Frota</Link>
  </div>
  <SimpleCargoTable cargo={cargo} drivers={(drivers.data||[]) as CargoDriver[]} connected={Boolean(gmail)}/>
 </>;
}