import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { RecordControl } from "@/components/records/record-control";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate } from "@/lib/finance/format";
import { PremiumTrend,PremiumExpenseList,makeWeeklyTrend } from "@/components/premium/analytics";

export default async function Page(){
  const data=await getFinanceSnapshot();
  const personalAccounts=data.accounts.filter(a=>data.workspaceMap.get(a.workspace_id)?.kind==="personal");
  const ids=new Set(data.workspaces.filter(w=>w.kind==="personal").map(w=>w.id));
  const due=data.payables.filter(x=>ids.has(x.workspace_id)&&["open","overdue","partial"].includes(x.status)).reduce((s,x)=>s+Math.max(0,Number(x.amount)-Number(x.paid_amount)),0);
  return <><Header title="Pessoal" subtitle="Seu dinheiro separado da Prime."/>
  <div className="record-toolbar"><RecordControl category="transaction" workspace="personal" label="Novo lançamento" lookups={{accounts:data.accounts.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="personal"),cards:data.cards.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="personal")}}/><RecordControl category="payable" workspace="personal" label="Nova conta a pagar"/><RecordControl category="receivable" workspace="personal" label="Novo recebível"/><RecordControl category="counterparty" workspace="personal" label="Nova pessoa"/><Link className="button" href="/contas">Contas</Link><Link className="button" href="/recorrentes">Despesas fixas</Link><Link className="button" href="/relatorios">Meu relatório</Link></div>
  <div className="grid grid-4"><Metric label="Receitas do mês" value={brl(data.personal.income)} tone="positive"/><Metric label="Gastos do mês" value={brl(data.personal.expense)}/><Metric label="Resultado" value={brl(data.personal.result)} tone={data.personal.result>=0?"positive":"warning"}/><Metric label="Contas cadastradas" value={String(personalAccounts.length)}/></div>
  <div className="premium-hero-strip"><div><span>Contas pessoais em aberto</span><strong>{brl(due)}</strong><small>Despesas futuras ou pendentes</small></div>
 <div><span>Saldo gerencial do período</span><strong>{brl(data.personal.result)}</strong><small>Não inclui extratos não classificados</small></div></div>
 <div className="premium-analytics-grid"><PremiumTrend title="Meu fluxo financeiro" points={makeWeeklyTrend(data.transactions,ids)}/>
 <PremiumExpenseList transactions={data.monthly} ids={ids}/></div>
 <SectionTitle title="Movimentações pessoais"/>
  <div className="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Ações</th></tr></thead><tbody>
  {data.transactions.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="personal").slice(0,15).map(x=><tr key={x.id}><td>{shortDate(x.occurred_at)}</td><td>{x.description}</td><td>{x.type}</td><td className={x.type==="income"?"positive":undefined}>{x.type==="expense"?"− ":""}{brl(x.amount)}</td><td><RecordControl category="transaction" workspace="personal" record={x}/></td></tr>)}
  {data.transactions.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="personal").length===0&&<tr><td colSpan={5}>Nenhum lançamento pessoal ainda.</td></tr>}
  </tbody></table></div>
  <SectionTitle title="Contas pessoais a pagar e receber"/><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Ações</th></tr></thead><tbody>
  {data.payables.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="personal").slice(0,25).map(x=><tr key={x.id}><td>A pagar</td><td>{x.description}</td><td>{shortDate(x.due_date)}</td><td>{brl(Number(x.amount)-Number(x.paid_amount))}</td><td><RecordControl category="payable" workspace="personal" record={x}/></td></tr>)}
  {data.receivables.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="personal").slice(0,25).map(x=><tr key={x.id}><td>A receber</td><td>{x.description}</td><td>{shortDate(x.due_date)}</td><td>{brl(Number(x.amount)-Number(x.received_amount))}</td><td><RecordControl category="receivable" workspace="personal" record={x}/></td></tr>)}
  </tbody></table></div>
  <SectionTitle title="Pessoas cadastradas" />
  <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Contato</th><th>Ações</th></tr></thead><tbody>
  {data.counterparties.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="personal").map(x=><tr key={x.id}><td>{x.name}</td><td>{x.kind}</td><td>{x.phone||"—"}</td><td><RecordControl category="counterparty" workspace="personal" record={x}/></td></tr>)}
  </tbody></table></div></>
}
