import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { RecordControl } from "@/components/records/record-control";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, pct, shortDate } from "@/lib/finance/format";
import { PremiumTrend,PremiumExpenseList,makeWeeklyTrend } from "@/components/premium/analytics";

export default async function Page(){
  const data=await getFinanceSnapshot();
  const ids=new Set(data.workspaces.filter(w=>w.kind==="prime").map(w=>w.id));
  const openOut=data.payables.filter(x=>ids.has(x.workspace_id)&&["open","partial","overdue"].includes(x.status)).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)-Number(x.paid_amount)),0);
  const openIn=data.receivables.filter(x=>ids.has(x.workspace_id)&&["open","partial","overdue"].includes(x.status)).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)-Number(x.received_amount)),0);
  const activeTrips=data.trips.filter(t=>t.status==="completed").length;
  return <><Header title="Prime Group" subtitle="Central de gestão · transportes, caixa, obrigações e resultados."/>
  <div className="record-toolbar"><RecordControl category="transaction" workspace="prime" label="Novo lançamento" lookups={{accounts:data.accounts.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="prime"),cards:data.cards.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="prime"),vehicles:data.vehicles}}/><RecordControl category="payable" workspace="prime" label="Nova conta a pagar"/><RecordControl category="receivable" workspace="prime" label="Novo recebível"/><RecordControl category="counterparty" workspace="prime" label="Novo cliente/fornecedor"/><Link className="button" href="/frota">Frota</Link><Link className="button" href="/viagens">Fretes</Link><Link className="button" href="/recorrentes">Dívidas fixas</Link><Link className="button" href="/equipes">Motoristas e ajudantes</Link><Link className="button" href="/relatorios">Relatórios</Link></div>
  <div className="grid grid-4"><Metric label="Faturamento do mês" value={brl(data.prime.income)}/><Metric label="Custos operacionais" value={brl(data.prime.expense)}/><Metric label="Resultado" value={brl(data.prime.result)} tone={data.prime.result>=0?"positive":"warning"}/><Metric label="Margem" value={data.prime.income>0?pct(data.prime.result/data.prime.income):"—"}/></div>
  <div className="premium-hero-strip"><div><span>Carteira de recebíveis</span><strong>{brl(openIn)}</strong><small>Valores em aberto, não recebidos</small></div>
  <div><span>Compromissos a pagar</span><strong>{brl(openOut)}</strong><small>Contas ainda não quitadas</small></div>
  <div><span>Fretes concluídos no cadastro</span><strong>{activeTrips}</strong><small>Sem confundir frete com recebimento</small></div></div>
  <div className="premium-analytics-grid"><PremiumTrend title="Desempenho da Prime" points={makeWeeklyTrend(data.transactions,ids)}/>
  <PremiumExpenseList transactions={data.monthly} ids={ids}/></div>
  <SectionTitle title="Lançamentos recentes"/>
  <div className="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Ações</th></tr></thead><tbody>
  {data.transactions.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="prime").slice(0,15).map(x=><tr key={x.id}><td>{shortDate(x.occurred_at)}</td><td>{x.description}</td><td>{x.type}</td><td className={x.type==="income"?"positive":undefined}>{x.type==="expense"?"− ":""}{brl(x.amount)}</td><td><RecordControl category="transaction" workspace="prime" record={x}/></td></tr>)}
  {data.transactions.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="prime").length===0&&<tr><td colSpan={5}>Nenhum lançamento da Prime ainda.</td></tr>}
  </tbody></table></div>
  <SectionTitle title="Contas a pagar e receber da Prime"/><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Ações</th></tr></thead><tbody>
  {data.payables.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="prime").slice(0,25).map(x=><tr key={x.id}><td>A pagar</td><td>{x.description}</td><td>{shortDate(x.due_date)}</td><td>{brl(Number(x.amount)-Number(x.paid_amount))}</td><td><RecordControl category="payable" workspace="prime" record={x}/></td></tr>)}
  {data.receivables.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="prime").slice(0,25).map(x=><tr key={x.id}><td>A receber</td><td>{x.description}</td><td>{shortDate(x.due_date)}</td><td>{brl(Number(x.amount)-Number(x.received_amount))}</td><td><RecordControl category="receivable" workspace="prime" record={x}/></td></tr>)}
  </tbody></table></div>
  <SectionTitle title="Clientes, fornecedores e motoristas" />
  <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Contato</th><th>Ações</th></tr></thead><tbody>
  {data.counterparties.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="prime").map(x=><tr key={x.id}><td>{x.name}</td><td>{x.kind}</td><td>{x.phone||"—"}</td><td><RecordControl category="counterparty" workspace="prime" record={x}/></td></tr>)}
  </tbody></table></div></>
}
