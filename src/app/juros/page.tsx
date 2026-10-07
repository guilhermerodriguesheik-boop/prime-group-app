import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate } from "@/lib/finance/format";

export default async function Page(){
  const data=await getFinanceSnapshot();
  const activeLoans=data.loans.filter(x=>x.status==="active");
  const principal=activeLoans.reduce((sum,x)=>sum+Number(x.principal),0);
  const people=new Map(data.counterparties.map(x=>[x.id,x.name]));
  return <><Header title="Recebíveis e juros" subtitle="Acordos separados da empresa e do pessoal."/>
  <div className="quick"><Link href="/cadastros">Novo contrato / recebível</Link><Link href="/assistente">Analisar com IA</Link></div>
  <div className="grid grid-4"><Metric label="Capital ativo" value={brl(principal)}/><Metric label="Receitas de juros no mês" value={brl(data.interest.income)} tone="positive"/><Metric label="A receber em aberto" value={brl(data.interest.openIn)}/><Metric label="Em atraso" value={brl(data.overdueReceivables)} tone={data.overdueReceivables>0?"warning":undefined}/></div>

  <SectionTitle title="Contratos ativos"/>
  <div className="table-wrap"><table><thead><tr><th>Pessoa</th><th>Capital</th><th>Juros</th><th>Início</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>
  {activeLoans.map(x=><tr key={x.id}><td>{people.get(x.counterparty_id)??"—"}</td><td>{brl(x.principal)}</td><td>{x.interest_type==="fixed"?brl(x.fixed_interest):x.periodic_rate?Number(x.periodic_rate).toLocaleString("pt-BR")+"% "+(x.rate_period??""):"manual"}</td><td>{shortDate(x.start_date)}</td><td>{shortDate(x.maturity_date)}</td><td>{x.status}</td></tr>)}
  {activeLoans.length===0&&<tr><td colSpan={6}>Nenhum contrato ativo cadastrado.</td></tr>}
  </tbody></table></div>

  <SectionTitle title="Recebíveis do ambiente Juros"/>
  <div className="table-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Saldo</th><th>Status</th></tr></thead><tbody>
  {data.receivables.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="interest").map(x=><tr key={x.id}><td>{shortDate(x.due_date)}</td><td>{x.description}</td><td>{brl(Number(x.amount)-Number(x.received_amount))}</td><td>{x.status}</td></tr>)}
  {data.receivables.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="interest").length===0&&<tr><td colSpan={4}>Nenhum recebível de juros cadastrado.</td></tr>}
  </tbody></table></div></>
}
