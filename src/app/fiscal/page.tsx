import {Header} from "@/components/ui";
import {GmailConnector} from "@/components/fiscal/gmail-connector";
import {OrtobomFinancePanel,type Cargo,type Period,type SentDocument} from "@/components/fiscal/ortobom-finance-panel";
import {gmailStatus,gmailClientStatus} from "@/lib/fiscal/gmail";
import {canonicalCargo} from "@/lib/fiscal/ortobom-finance-parser";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {redirect} from "next/navigation";
type Draft={cargo_reference:string|null;freight_value:number|string|null;ciot:string|null;created_at:string;document_type:string};
type Nfe={access_key:string;cargo_reference:string|null};
type FinanceLine={cargo_reference:string;cte_number:string|null;declared_freight:number|string|null;declared_advance:number|string|null;declared_balance:number|string|null};
type FinanceEmail={id:string;event_kind:string;email_date:string|null;payment_date:string|null;period_start:string|null;period_end:string|null;declared_bank_deposit:number|string|null;declared_promissory_discount:number|string|null;ortobom_financial_lines:FinanceLine[]};
type DocRow={id:string;message_id:string;cargo_reference:string|null;cte_number:string|null;subject:string;email_date:string|null;attachment_names:string[];has_xml:boolean;evidence_status:string};
type TripRow={id:string;reference:string|null;freight_revenue:number|string|null;driver_cost:number|string|null};
type AmountRow={trip_id:string|null;total_amount?:number|string|null;amount?:number|string|null};
type BankRow={id:string;occurred_on:string;amount:number|string;direction:string;provider_status:string};
type MutableCargo=Cargo&{advanceEmails:number;periodAdvance:number|null;periodBalance:number|null;paymentEvidence:boolean};
const amount=(value:number|string|null|undefined):number|null=>value===null||value===undefined?null:Number.isFinite(Number(value))?Number(value):null;
export default async function FiscalPage({searchParams}:{searchParams:Promise<{gmail?:string;reason?:string}>}){
 const query=await searchParams;
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)redirect("/login");
 const {data:ws}=await client.from("workspaces").select("id").eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 const db=client as unknown as SupabaseClient;
 const [gmail,googleClient]=await Promise.all([
  ws?gmailStatus(ws.id).catch(()=>null):Promise.resolve(null),
  gmailClientStatus(),
 ]);
 const ready=Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.GOOGLE_GMAIL_CLIENT_ID&&
  process.env.GOOGLE_GMAIL_CLIENT_SECRET&&process.env.GMAIL_TOKEN_ENCRYPTION_KEY&&process.env.APP_BASE_URL);
 const [d,n,e,docs,trips,fuel,tolls,workers,banks]=await Promise.all([
  ws?db.from("fiscal_drafts").select("cargo_reference,freight_value,ciot,created_at,document_type").eq("workspace_id",ws.id).order("created_at",{ascending:true}).limit(1000):Promise.resolve({data:[]}),
  ws?db.from("fiscal_nfe_inbox").select("access_key,cargo_reference").eq("workspace_id",ws.id).limit(2000):Promise.resolve({data:[]}),
  ws?db.from("ortobom_financial_emails").select("id,event_kind,email_date,payment_date,period_start,period_end,declared_bank_deposit,declared_promissory_discount,ortobom_financial_lines(cargo_reference,cte_number,declared_freight,declared_advance,declared_balance)").eq("workspace_id",ws.id).order("email_date",{ascending:true}).limit(1000):Promise.resolve({data:[]}),
  ws?db.from("ortobom_cte_email_documents").select("id,message_id,cargo_reference,cte_number,subject,email_date,attachment_names,has_xml,evidence_status").eq("workspace_id",ws.id).order("email_date",{ascending:false}).limit(300):Promise.resolve({data:[]}),
  ws?db.from("trips").select("id,reference,freight_revenue,driver_cost").eq("workspace_id",ws.id).limit(500):Promise.resolve({data:[]}),
  ws?db.from("fuel_logs").select("trip_id,total_amount").eq("workspace_id",ws.id).limit(2000):Promise.resolve({data:[]}),
  ws?db.from("tolls").select("trip_id,amount").eq("workspace_id",ws.id).limit(2000):Promise.resolve({data:[]}),
  ws?db.from("prime_trip_workers").select("trip_id,amount").limit(2000):Promise.resolve({data:[]}),
  ws?db.from("bank_transactions").select("id,occurred_on,amount,direction,provider_status").eq("workspace_id",ws.id).eq("direction","credit").gte("occurred_on","2026-01-01").limit(1500):Promise.resolve({data:[]}),
 ]);
 const failed=[d,n,e,docs,trips,fuel,tolls,workers,banks].some(x=>"error" in x&&x.error);
 const drafts=(d.data||[]) as Draft[];
 const nfes=(n.data||[]) as Nfe[];
 const emails=(e.data||[]) as FinanceEmail[];
 const sent=(docs.data||[]) as DocRow[];
 const tripRows=(trips.data||[]) as TripRow[];
 const costsByTrip=new Map<string,number>();
 const addCost=(id:string|null,value:number|string|null|undefined)=>{
  if(!id)return;
  costsByTrip.set(id,(costsByTrip.get(id)||0)+(amount(value)||0));
 };
 for(const t of tripRows)addCost(t.id,t.driver_cost);
 for(const x of (fuel.data||[]) as AmountRow[])addCost(x.trip_id,x.total_amount);
 for(const x of (tolls.data||[]) as AmountRow[])addCost(x.trip_id,x.amount);
 for(const x of (workers.data||[]) as AmountRow[])addCost(x.trip_id,x.amount);
 const map=new Map<string,MutableCargo>();
 function ensure(reference:string|null|undefined):MutableCargo|null{
  const id=canonicalCargo(reference||"");if(id.length<4||id.length>12)return null;
  let value=map.get(id);
  if(!value){value={cargo:id.padStart(6,"0"),freight:null,claimed:null,advance:0,balance:null,
   cost:0,profit:null,cte:null,ciot:null,status:"Aguardando informações",invoices:0,documented:false,
   advanceEmails:0,periodAdvance:null,periodBalance:null,paymentEvidence:false};map.set(id,value);}
  return value;
 }
 for(const x of drafts){
  if(x.document_type!=="cte")continue;
  const c=ensure(x.cargo_reference);if(!c)continue;
  if(amount(x.freight_value)!==null)c.freight=amount(x.freight_value);
  if(x.ciot)c.ciot=x.ciot;
 }
 for(const x of nfes){const c=ensure(x.cargo_reference);if(c)c.invoices++;}
 const periods:Period[]=[];
 const credits=(banks.data||[]) as BankRow[];
 const used=new Set<string>();
 const sorted=[...emails].sort((a,b)=>(a.email_date||"").localeCompare(b.email_date||""));
 for(const x of sorted){
  if(x.event_kind==="period_payment"){
   const deposit=amount(x.declared_bank_deposit);let bankMatch="Sem crédito bancário confirmado";
   if(x.payment_date&&deposit!==null){
    const bankDate=new Date(x.payment_date+"T12:00:00Z").getTime();
    const candidates=credits.filter(b=>b.provider_status==="POSTED"&&!used.has(b.id)&&
     Math.abs(Number(b.amount)-deposit)<0.01&&
     Math.abs(new Date(b.occurred_on+"T12:00:00Z").getTime()-bankDate)<=3*86400000);
    if(candidates.length===1){used.add(candidates[0].id);bankMatch="Crédito compatível; conferir identificação";}
    else if(candidates.length>1)bankMatch="Mais de um crédito compatível";
    else bankMatch="Nenhum crédito compatível encontrado";
   }
   periods.push({id:x.id,date:x.payment_date,
    period:[x.period_start,x.period_end].filter(Boolean).join(" a ")||"Não informado",
    deposit,promissory:amount(x.declared_promissory_discount),
    loads:x.ortobom_financial_lines?.length||0,bankMatch});
   if(bankMatch.startsWith("Crédito compatível"))
    for(const l of x.ortobom_financial_lines||[]){const c=ensure(l.cargo_reference);if(c)c.paymentEvidence=true;}
  }
  for(const l of x.ortobom_financial_lines||[]){
   const c=ensure(l.cargo_reference);if(!c)continue;
   if(amount(l.declared_freight)!==null)c.claimed=amount(l.declared_freight);
   if(x.event_kind==="advance"&&amount(l.declared_advance)!==null)
    c.advanceEmails+=amount(l.declared_advance)||0;
   if(x.event_kind==="period_payment"){
    if(amount(l.declared_advance)!==null)c.periodAdvance=amount(l.declared_advance);
    if(amount(l.declared_balance)!==null)c.periodBalance=amount(l.declared_balance);
   }
   if(l.cte_number)c.cte=l.cte_number;
  }
 }
 const documents:SentDocument[]=sent.map(x=>({
  id:x.id,messageId:x.message_id,cargo:x.cargo_reference,cte:x.cte_number,
  subject:x.subject,date:x.email_date,files:Array.isArray(x.attachment_names)?x.attachment_names:[],
  hasXml:x.has_xml,evidence:x.evidence_status,
 }));
 for(const item of sent){
  const c=ensure(item.cargo_reference);if(!c)continue;
  c.documented=true;if(item.cte_number&&!c.cte)c.cte=item.cte_number;
 }
 for(const item of tripRows){
  const c=ensure(item.reference);if(!c)continue;
  c.cost+=costsByTrip.get(item.id)||0;
  if(c.freight===null)c.freight=amount(item.freight_revenue);
 }
 for(const c of map.values()){
  c.advance=c.periodAdvance??c.advanceEmails;
  c.balance=c.periodBalance??((c.freight??c.claimed)!==null?
   Math.max(0,(c.freight??c.claimed??0)-c.advance):null);
  c.profit=(c.freight??c.claimed)!==null?(c.freight??c.claimed??0)-c.cost:null;
  c.status=c.freight!==null&&c.claimed!==null&&Math.abs(c.freight-c.claimed)>0.01?
   "Divergência de frete":c.paymentEvidence?
   "Crédito compatível no período; conferir":c.documented?
   "CT-e anexado · acerto a conferir":c.advance>0?
   "Adiantamento declarado":"Aguardando CT-e ou acerto";
 }
 const cargo:Cargo[]=[...map.values()].sort((a,b)=>b.cargo.localeCompare(a.cargo));
 const totalFreight=cargo.reduce((s,c)=>s+(c.freight??c.claimed??0),0);
 const totalAdvances=cargo.reduce((s,c)=>s+c.advance,0);
 const totalEstimatedBalance=cargo.reduce((s,c)=>s+(c.balance??0),0);
 const money=(v:number)=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
 return <>
  <Header title="Cargas e acertos" subtitle="Controle operacional Prime Group · Cargozilla emite CT-e; Gmail alimenta o financeiro."/>
  <div className="fiscal-workspace">
   <section className="fiscal-hero">
    <div className="fiscal-hero-content">
     <span className="fiscal-overline">PRIME GROUP / GESTÃO DE FRETES</span>
     <h2>Da Cargozilla para o controle financeiro, sem redigitar as cargas.</h2>
     <p>A emissão de CT-e e MDF-e permanece exclusivamente na Cargozilla. O Prime Finance lê
      os e-mails da Ortobom, reúne arquivos, adiantamentos, pagamentos e custos registrados.</p>
     <div className="fiscal-hero-cta">
      <a href="#ortobom-finance" className="fiscal-hero-button">Ver planilha <span aria-hidden="true">↗</span></a>
      <a href="#gmail-integration" className="fiscal-hero-textlink">Atualizar Gmail <span aria-hidden="true">→</span></a>
     </div>
    </div>
    <div className="fiscal-hero-metrics">
     <div><span>Cargas identificadas</span><strong>{cargo.length}</strong><small>{nfes.length} XML(s) NF-e</small></div>
     <div><span>Frete declarado/contratado</span><strong>{money(totalFreight)}</strong><small>Sem baixa bancária automática</small></div>
     <div><span>Adiantamentos declarados</span><strong>{money(totalAdvances)}</strong><small>Saldo estimado {money(totalEstimatedBalance)}</small></div>
    </div>
   </section>
   {query.gmail==="connected"&&gmail&&<div className="fiscal-alert fiscal-alert-success" role="status">Gmail autorizado e conectado.</div>}
   {query.gmail==="connection_failed"&&<div className="fiscal-alert fiscal-alert-error" role="alert">
    Erro ao conectar o Gmail ({query.reason||"desconhecido"}). Confirme o acesso à conta logística.</div>}
   {!ws&&<div className="fiscal-alert fiscal-alert-error">Ambiente Prime Group ainda não localizado.</div>}
   {failed&&<div className="fiscal-alert fiscal-alert-error">Algumas consultas falharam. O quadro pode estar incompleto; atualize após conferir a conexão.</div>}
   <section id="gmail-integration">
    <div className="fiscal-section-intro"><div><span className="fiscal-section-kicker">01 / CAIXA DE ENTRADA</span>
     <h2>Gmail da transportadora</h2><p>Importação de XML da Ortobom, CT-e enviados e informes de acerto financeiro.</p>
    </div></div>
    {ws&&<GmailConnector connected={Boolean(gmail)} ready={ready} clientStatus={googleClient}
     lastSync={gmail?.last_sync_at||null} lastError={gmail?.last_error||null}/>}
   </section>
   <OrtobomFinancePanel cargo={cargo} periods={periods.reverse()} documents={documents}
    emailCount={emails.length} connected={Boolean(gmail)}/>
   <p className="fiscal-compliance">O aplicativo não emite, cancela ou transmite CT-e/MDF-e à SEFAZ.
    Os documentos históricos permanecem arquivados para conferência. Valores de e-mail não comprovam quitação.
   </p>
  </div>
 </>;
}
