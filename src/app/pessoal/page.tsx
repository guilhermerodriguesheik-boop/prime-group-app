import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate } from "@/lib/finance/format";

export default async function Page(){
  const data=await getFinanceSnapshot();
  const personalAccounts=data.accounts.filter(a=>data.workspaceMap.get(a.workspace_id)?.kind==="personal");
  return <><Header title="Pessoal" subtitle="Seu dinheiro separado da Prime."/>
  <div className="quick"><Link href="/cadastros">Novo lançamento</Link><Link href="/contas">Contas</Link></div>
  <div className="grid grid-4"><Metric label="Receitas do mês" value={brl(data.personal.income)} tone="positive"/><Metric label="Gastos do mês" value={brl(data.personal.expense)}/><Metric label="Resultado" value={brl(data.personal.result)} tone={data.personal.result>=0?"positive":"warning"}/><Metric label="Contas cadastradas" value={String(personalAccounts.length)}/></div>
  <SectionTitle title="Movimentações pessoais"/>
  <div className="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>
  {data.transactions.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="personal").slice(0,15).map(x=><tr key={x.id}><td>{shortDate(x.occurred_at)}</td><td>{x.description}</td><td>{x.type}</td><td className={x.type==="income"?"positive":undefined}>{x.type==="expense"?"− ":""}{brl(x.amount)}</td></tr>)}
  {data.transactions.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="personal").length===0&&<tr><td colSpan={4}>Nenhum lançamento pessoal ainda.</td></tr>}
  </tbody></table></div></>
}
