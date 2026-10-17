import Link from "next/link";
import {Header,Metric,SectionTitle} from "@/components/ui";
import {RecordControl} from "@/components/records/record-control";
import {getFinanceSnapshot} from "@/lib/finance/data";
import {brl,shortDate,workspaceLabel} from "@/lib/finance/format";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {BankBillMatcher} from "@/components/finance/bank-bill-matcher";
import {FinanceRefresh} from "@/components/finance/finance-refresh";
import {cargoCosts} from "@/lib/fiscal/cargo-costs";
import {buildCargoLedger,type LedgerDraft,type LedgerEmail} from "@/lib/fiscal/simple-cargo-ledger";
import {applyManualBalanceReceipt} from "@/lib/fiscal/manual-balance";
import type {ReviewCargo,ReviewRecurring} from "@/lib/finance/bank-review-suggestions";

export const dynamic="force-dynamic";

type Fixed={id:string;workspace_id:string;description:string;amount:number|string;
 frequency:"weekly"|"monthly"|"quarterly"|"yearly";due_day:number;active:boolean};
export default async function FinanceiroPage(){
 const data=await getFinanceSnapshot();
 const ids=new Set(data.workspaces.filter(w=>w.kind==="prime"||w.kind==="personal").map(w=>w.id));
 const db=await createClient() as unknown as SupabaseClient;
 const response=ids.size?await db.from("prime_recurring_bills")
  .select("id,workspace_id,description,amount,frequency,due_day,active")
  .in("workspace_id",[...ids]).eq("active",true).order("due_day").limit(100):
  {data:[] as Fixed[],error:null};
 const fixed=(response.data||[]) as Fixed[];
 const primeIds=data.workspaces.filter(w=>w.kind==="prime").map(w=>w.id);
 const financeIds=[...ids];
 const [bankConnections,bankAccounts,bankMoves,bankMatches,cargoOps,cargoDrafts,cargoEmails]=await Promise.all([
  db.from("bank_connections").select("id,workspace_id,display_name,provider,status,last_synced_at,last_error,archived_at")
   .eq("owner_id",data.user.id).is("archived_at",null).order("created_at",{ascending:false}).limit(15),
  db.from("bank_accounts").select("id,workspace_id,display_name,kind,currency,balance,balance_updated_at")
   .eq("owner_id",data.user.id).limit(100),
  db.from("bank_transactions")
   .select("id,workspace_id,bank_account_id,occurred_on,description,amount,direction,review_status")
   .eq("owner_id",data.user.id).eq("provider_status","POSTED")
   .eq("review_status","pending").order("occurred_on",{ascending:false}).limit(50),
  db.from("prime_bank_bill_matches").select("bank_transaction_id,workspace_id,bill_kind,bill_id,amount,created_at")
   .eq("owner_id",data.user.id).order("created_at",{ascending:false}).limit(40),
  primeIds.length?db.from("prime_cargo_operations")
   .select("cargo_reference,workspace_id,driver_pay,driver_paid,helper_count,helper_rate,helpers_paid,diesel,tolls,other_expenses,manual_settled_on,manual_settled_amount")
   .in("workspace_id",primeIds).limit(2000):Promise.resolve({data:[],error:null}),
  primeIds.length?db.from("fiscal_drafts").select("cargo_reference,freight_value")
   .in("workspace_id",primeIds).eq("document_type","cte").limit(2000):Promise.resolve({data:[],error:null}),
  primeIds.length?db.from("ortobom_financial_emails")
   .select("event_kind,email_date,ortobom_financial_lines(cargo_reference,declared_freight,declared_advance,declared_balance)")
   .in("workspace_id",primeIds).order("email_date").limit(2000):Promise.resolve({data:[],error:null}),
 ]);
 const errors=[bankConnections.error,bankAccounts.error,bankMoves.error,bankMatches.error,
  cargoOps.error,cargoDrafts.error,cargoEmails.error].filter(Boolean);
 const bankNames=Object.fromEntries((bankAccounts.data||[]).map(a=>[a.id,a.display_name]));
 const bankAccountIds=(bankAccounts.data||[]).filter(a=>a.kind==="BANK"&&a.currency==="BRL").map(a=>a.id);
 const unreviewedCount=bankAccountIds.length?await db.from("bank_transactions")
  .select("id",{count:"exact",head:true}).eq("owner_id",data.user.id)
  .in("bank_account_id",bankAccountIds).eq("provider_status","POSTED")
  .eq("review_status","pending"): {count:0,error:null};
 const bankBalances=(bankAccounts.data||[]).filter(a=>a.kind==="BANK"&&a.currency==="BRL"
  &&a.balance!==null);
 const eligibleAccounts=new Set((bankAccounts.data||[])
   .filter(a=>a.kind==="BANK"&&a.currency==="BRL").map(a=>a.id));
 const unmatched=(bankMoves.data||[]).filter(m=>eligibleAccounts.has(m.bank_account_id)
   &&financeIds.includes(m.workspace_id)) as {
   id:string;workspace_id:string;bank_account_id:string;occurred_on:string;
   description:string;amount:number|string;direction:"credit"|"debit";review_status:string;
  }[];
 const billData=[
  ...data.payables.filter(p=>financeIds.includes(p.workspace_id)).map(p=>({
   id:p.id,workspace_id:p.workspace_id,description:p.description,amount:p.amount,
   settled:p.paid_amount,status:p.status,due_date:p.due_date,kind:"payable" as const})),
  ...data.receivables.filter(p=>financeIds.includes(p.workspace_id)).map(p=>({
   id:p.id,workspace_id:p.workspace_id,description:p.description,amount:p.amount,
   settled:p.received_amount,status:p.status,due_date:p.due_date,kind:"receivable" as const})),
 ];
 const ops=(cargoOps.data||[]) as Array<{cargo_reference:string;driver_pay:number|string;driver_paid:boolean;
  helper_count:number;helper_rate:number|string;helpers_paid:boolean;diesel:number|string;tolls:number|string;
  other_expenses:number|string;manual_settled_on:string|null;manual_settled_amount:number|string|null}>;
 const cargoById=new Map(ops.map(o=>[o.cargo_reference,o]));
 const cargoList=buildCargoLedger((cargoDrafts.data||[]) as LedgerDraft[],(cargoEmails.data||[]) as LedgerEmail[]);
 const cargoOutstanding=cargoList.reduce((sum,c)=>sum+Number(
  applyManualBalanceReceipt(c,cargoById.get(c.cargo.replace(/^0+(?=\d)/,""))||null).pending||0),0);
 const crewTotals=ops.reduce((sum,o)=>{
  const item=cargoCosts(o,null);
  return {drivers:sum.drivers+item.driverDue,helpers:sum.helpers+item.helperDue};
 },{drivers:0,helpers:0});
 const bankLast=(bankConnections.data||[]).map(c=>c.last_synced_at?Date.parse(c.last_synced_at):0);
 const lastBankSync=Math.max(0,...bankLast);
 const staleBank=lastBankSync?new Date().getTime()-lastBankSync>24*60*60*1000:true;

 const pending=data.payables.filter(p=>ids.has(p.workspace_id)&&["open","overdue","partial"].includes(p.status))
  .map(p=>({...p,remaining:Math.max(0,Number(p.amount)-Number(p.paid_amount))}))
  .filter(p=>p.remaining>0)
  .sort((a,b)=>a.due_date.localeCompare(b.due_date));
 const amount=pending.reduce((s,p)=>s+p.remaining,0);
 const today=new Intl.DateTimeFormat("sv-SE",{
  timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"
 }).format(new Date());
 const past=pending.filter(p=>p.due_date<today);
 const recurring=data.recurringEntries.filter(e=>ids.has(e.workspace_id)&&e.active&&e.type==="expense");
 const recurringHints:ReviewRecurring[]=[
  ...fixed.filter(x=>x.frequency==="monthly").map(x=>({
   workspace_id:x.workspace_id,description:x.description,amount:x.amount,
   due_day:x.due_day,frequency:x.frequency})),
  ...recurring.filter(x=>x.frequency==="monthly"&&typeof x.due_day==="number").map(x=>({
   workspace_id:x.workspace_id,description:x.name,amount:x.amount,
   due_day:Number(x.due_day),frequency:x.frequency})),
 ];
 const cargoHints=new Map<string,ReviewCargo>();
 for(const email of (cargoEmails.data||[]) as LedgerEmail[]){
  if(email.event_kind!=="period_payment"||!email.email_date)continue;
  for(const line of email.ortobom_financial_lines||[]){
   const reference=String(line.cargo_reference||"").replace(/\\D/g,"").replace(/^0+(?=\\d)/,"");
   if(!reference)continue;
   const value=Number(line.declared_balance??NaN);
   if(!Number.isFinite(value)||value<=0)continue;
   const workspaceId=primeIds[0];if(!workspaceId)continue;
   cargoHints.set(workspaceId+":"+reference,{
    workspace_id:workspaceId,reference:reference.padStart(6,"0"),
    amount:value,date:email.email_date.slice(0,10)});
  }
 }
 for(const op of ops){
  if(!op.manual_settled_on||!op.manual_settled_amount)continue;
  const workspaceId=primeIds[0];if(!workspaceId)continue;
  const key=workspaceId+":"+op.cargo_reference;
  if(!cargoHints.has(key))cargoHints.set(key,{
   workspace_id:workspaceId,reference:op.cargo_reference.padStart(6,"0"),
   amount:Number(op.manual_settled_amount),date:op.manual_settled_on});
 }

 const frequencyLabel=(v:string)=>v==="weekly"?"semanal":v==="quarterly"?"trimestral":v==="yearly"?"anual":"mensal";
 return <>
  <Header title="Financeiro" subtitle="Pagamentos pendentes, despesas recorrentes e contas em um lugar"/>
  <div className="quick">
   <FinanceRefresh/>
   <Link href="/fiscal">Conferir cargas e equipe</Link>
   <Link href="/juros">Empréstimos</Link>
   <Link href="/bancos">Conectar / atualizar bancos</Link>
   <Link href="/planejamento">Ver todos os vencimentos e lembretes</Link>
   <Link href="/recorrentes">Gerenciar contas recorrentes</Link>
   <Link href="/contas">Contas e cartões</Link>
   <Link href="/relatorios">Relatórios</Link>
  </div>
  <div className="grid grid-3" style={{marginTop:18}}>
   <Metric label="Contas pendentes cadastradas" value={brl(amount)} tone={amount>0?"warning":undefined}/>
   <Metric label="Contas vencidas" value={brl(past.reduce((s,p)=>s+p.remaining,0))} tone={past.length?"warning":undefined}/>
   <Metric label="Compromissos recorrentes ativos" value={String(recurring.length+fixed.length)}/>
  </div>
  <SectionTitle title="Visão entre os sistemas" hint="Valores separados para evitar somar duas vezes a mesma obrigação"/>
  <div className="grid grid-3">
   <Metric label="Saldos de fretes pendentes · Ortobom" value={brl(cargoOutstanding)}
    tone={cargoOutstanding>0?"warning":undefined}/>
   <Metric label="Motoristas a pagar · cargas" value={brl(crewTotals.drivers)}/>
   <Metric label="Ajudantes a pagar · cargas" value={brl(crewTotals.helpers)}/>
   <Metric label="Empréstimos · capital a receber" value={brl(data.interest.openIn)}/>
   <Metric label="Extratos bancários a conciliar" value={String(unreviewedCount.count??unmatched.length)}
    tone={unmatched.length>0?"warning":undefined}/>
  </div>
  <p className="metric-foot">Fretes, equipe, empréstimos e contas possuem origens diferentes.
   Os totais acima são informativos e não são somados automaticamente ao caixa.
   Registrar uma baixa operacional não cria uma movimentação bancária.</p>
  <SectionTitle title="Integrações bancárias" hint="Conexões disponíveis e data do último dado importado"/>
  {errors.length>0&&<div className="notice attention">
   Algumas fontes estão indisponíveis. Confira as integrações antes de usar o resumo.</div>}
  <div className="table-wrap"><table><thead><tr><th>Banco</th><th>Status</th><th>Última importação</th></tr></thead><tbody>
   {(bankConnections.data||[]).map(c=><tr key={c.id}>
    <td>{c.display_name}</td><td>{c.status}</td>
    <td>{c.last_synced_at?new Date(c.last_synced_at).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"Sem sincronização"}
     {c.last_error&&<small style={{display:"block"}}>Atenção: {c.last_error}</small>}</td>
   </tr>)}
   {!bankConnections.data?.length&&<tr><td colSpan={3}>Nenhuma conexão bancária ativa.</td></tr>}
  </tbody></table></div>
  {bankBalances.length>0&&<p className="metric-foot">
   Saldo informado no último extrato: {bankBalances.map(a=>a.display_name+" — "+brl(a.balance)).join(" | ")}.
   Os saldos reais informados pelos bancos não são somados ao caixa gerencial para evitar duplicidade.
  </p>}
  {unreviewedCount.error&&<p className="notice">Não foi possível contar os movimentos pendentes.</p>}
  {staleBank&&<p className="notice attention">Extratos podem estar desatualizados.
   Abra <Link href="/bancos">Bancos</Link> e solicite atualização quando a instituição permitir.</p>}
  <p className="metric-foot">O resumo é recarregado periodicamente enquanto esta página estiver aberta,
   mas o Open Finance não fornece garantia de atualização instantânea. A integração bancária é somente leitura.</p>
  <SectionTitle title="Pagamentos pendentes" hint="Contas registradas na Prime e no Pessoal"/>
  <div className="record-toolbar">
   <RecordControl category="payable" workspace="prime" label="+ Conta a pagar Prime"/>
   <RecordControl category="payable" workspace="personal" label="+ Conta a pagar pessoal"/>
  </div>
  <div className="table-wrap"><table><thead><tr>
   <th>Conta</th><th>Área</th><th>Vencimento</th><th>Saldo</th><th>Situação</th><th>Ações</th>
  </tr></thead><tbody>
   {pending.slice(0,30).map(p=><tr key={p.id}>
    <td>{p.description}</td>
    <td>{workspaceLabel(data.workspaceMap.get(p.workspace_id)?.kind||"")}</td>
    <td>{shortDate(p.due_date)}</td>
    <td><strong>{brl(p.remaining)}</strong></td>
    <td><span className={"badge "+(p.due_date<today?"red":"orange")}>{p.due_date<today?"Vencida":"A pagar"}</span></td>
    <td><RecordControl category="payable" workspace={data.workspaceMap.get(p.workspace_id)?.kind==="prime"?"prime":"personal"} record={p}/></td>
   </tr>)}
   {!pending.length&&<tr><td colSpan={6}>Nenhuma conta pendente cadastrada.</td></tr>}
  </tbody></table></div>
  {pending.length>30&&<p className="metric-foot">Mostrando 30 de {pending.length} contas. <Link href="/planejamento">Ver todas</Link>.</p>}
  <SectionTitle title="Pagamentos recorrentes" hint="Aluguel, planos, parcelas e outras despesas fixas"/>
  {response.error&&<div className="notice">Alguns compromissos recorrentes não puderam ser carregados.</div>}
  <div className="table-wrap"><table><thead><tr>
   <th>Compromisso</th><th>Área</th><th>Periodicidade</th><th>Valor</th>
  </tr></thead><tbody>
   {fixed.map(f=><tr key={"fixed-"+f.id}>
    <td>{f.description}</td>
    <td>{workspaceLabel(data.workspaceMap.get(f.workspace_id)?.kind||"")}</td>
    <td>{frequencyLabel(f.frequency)} · dia {f.due_day}</td><td>{brl(f.amount)}</td>
   </tr>)}
   {recurring.map(e=><tr key={"recurring-"+e.id}>
    <td>{e.name}</td>
    <td>{workspaceLabel(data.workspaceMap.get(e.workspace_id)?.kind||"")}</td>
    <td>{frequencyLabel(e.frequency)}{e.due_day?" · dia "+e.due_day:""}</td>
    <td>{brl(e.amount)}</td>
   </tr>)}
   {!fixed.length&&!recurring.length&&<tr><td colSpan={4}>Nenhuma despesa recorrente cadastrada.</td></tr>}
  </tbody></table></div>
  <SectionTitle title="Conciliação bancária" hint="A baixa só ocorre após você vincular o extrato à conta correta"/>
  <BankBillMatcher movements={unmatched} bills={billData} recurring={recurringHints} cargos={[...cargoHints.values()]}
   matches={(bankMatches.data||[]) as Array<{bank_transaction_id:string;workspace_id:string;bill_kind:string;bill_id:string;amount:number|string;created_at:string}>}
   accountNames={bankNames}/>
  <p className="metric-foot" style={{marginTop:12}}>Baixas por e-mail da Ortobom e baixas manuais
   de cargas permanecem identificadas no Transporte. O extrato é mantido separado até
   a conciliação de cada obrigação, impedindo pagamentos duplicados.</p>
  <p className="metric-foot" style={{marginTop:12}}>
   Estes valores representam obrigações cadastradas, não pagamentos bancários comprovados.
   Para editar uma recorrência, acesse <Link href="/recorrentes">Despesas recorrentes</Link>.
   As contas da transportadora e as pessoais permanecem identificadas separadamente.
  </p>
 </>;
}
