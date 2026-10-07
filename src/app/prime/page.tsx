import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, pct, shortDate } from "@/lib/finance/format";

export default async function Page(){
  const data=await getFinanceSnapshot();
  return <><Header title="Prime Group" subtitle="Financeiro e operação da transportadora."/>
  <div className="quick"><Link href="/cadastros">Novo lançamento</Link><Link href="/frota">Frota</Link><Link href="/viagens">Viagens</Link></div>
  <div className="grid grid-4"><Metric label="Faturamento do mês" value={brl(data.prime.income)}/><Metric label="Custos operacionais" value={brl(data.prime.expense)}/><Metric label="Resultado" value={brl(data.prime.result)} tone={data.prime.result>=0?"positive":"warning"}/><Metric label="Margem" value={data.prime.income>0?pct(data.prime.result/data.prime.income):"—"}/></div>
  <SectionTitle title="Lançamentos recentes"/>
  <div className="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>
  {data.transactions.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="prime").slice(0,15).map(x=><tr key={x.id}><td>{shortDate(x.occurred_at)}</td><td>{x.description}</td><td>{x.type}</td><td className={x.type==="income"?"positive":undefined}>{x.type==="expense"?"− ":""}{brl(x.amount)}</td></tr>)}
  {data.transactions.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="prime").length===0&&<tr><td colSpan={4}>Nenhum lançamento da Prime ainda.</td></tr>}
  </tbody></table></div></>
}
