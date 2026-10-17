import {Header} from "@/components/ui";
import {SimpleCargoTable} from "@/components/fiscal/simple-cargo-table";
import {gmailStatus} from "@/lib/fiscal/gmail";
import {buildCargoLedger,type LedgerDraft,type LedgerEmail} from "@/lib/fiscal/simple-cargo-ledger";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {redirect} from "next/navigation";

export default async function FiscalPage({searchParams}:{searchParams:Promise<{gmail?:string;reason?:string}>}){
 const query=await searchParams;
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)redirect("/login");
 const {data:ws}=await client.from("workspaces")
  .select("id").eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 const db=client as unknown as SupabaseClient;
 const gmail=ws?await gmailStatus(ws.id).catch(()=>null):null;
 const [drafts,emails]=await Promise.all([
  ws?db.from("fiscal_drafts").select("cargo_reference,freight_value")
   .eq("workspace_id",ws.id).eq("document_type","cte").order("created_at",{ascending:true}).limit(2000):
   Promise.resolve({data:[],error:null}),
  ws?db.from("ortobom_financial_emails")
   .select("event_kind,email_date,ortobom_financial_lines(cargo_reference,declared_freight,declared_advance,declared_balance)")
   .eq("workspace_id",ws.id).order("email_date",{ascending:true}).limit(2000):
   Promise.resolve({data:[],error:null}),
 ]);
 const cargo=buildCargoLedger((drafts.data||[]) as LedgerDraft[],(emails.data||[]) as LedgerEmail[]);
 const unavailable=Boolean(drafts.error||emails.error);
 return <>
  <Header title="Cargas e pagamentos" subtitle="Planilha simples da Prime Group"/>
  {query.gmail==="connection_failed"&&<div className="fiscal-alert fiscal-alert-error">Não foi possível conectar o Gmail: {query.reason||"tente novamente"}.</div>}
  {!ws&&<div className="fiscal-alert fiscal-alert-error">Ambiente Prime Group não encontrado.</div>}
  {unavailable&&<div className="fiscal-alert fiscal-alert-error">Não foi possível carregar todos os registros. Confira a conexão antes de usar os totais.</div>}
  <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",margin:"12px 0 18px"}}>
   <span style={{fontSize:13}}>{gmail?"Gmail conectado":"Gmail não conectado"}</span>
   {!gmail&&<a className="button primary" href="/api/fiscal/gmail/connect">Conectar Gmail</a>}
  </div>
  <SimpleCargoTable cargo={cargo} connected={Boolean(gmail)}/>
 </>;
}
