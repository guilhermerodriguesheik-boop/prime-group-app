import Link from "next/link";
import {Header,Metric,SectionTitle} from "@/components/ui";
import {RecordControl} from "@/components/records/record-control";
import {getFinanceSnapshot} from "@/lib/finance/data";
import {brl,shortDate,workspaceLabel} from "@/lib/finance/format";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";

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
 const frequencyLabel=(v:string)=>v==="weekly"?"semanal":v==="quarterly"?"trimestral":v==="yearly"?"anual":"mensal";
 return <>
  <Header title="Financeiro" subtitle="Pagamentos pendentes, despesas recorrentes e contas em um lugar"/>
  <div className="quick">
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
  <p className="metric-foot" style={{marginTop:12}}>
   Estes valores representam obrigações cadastradas, não pagamentos bancários comprovados.
   Para editar uma recorrência, acesse <Link href="/recorrentes">Despesas recorrentes</Link>.
   As contas da transportadora e as pessoais permanecem identificadas separadamente.
  </p>
 </>;
}
