import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate } from "@/lib/finance/format";

export default async function Page(){
  const data=await getFinanceSnapshot();
  const activeLoans=data.loans.filter(x=>x.status==="active");
  const principal=activeLoans.reduce((sum,x)=>sum+Number(x.principal),0);
  return <><Header title="Recebíveis e juros" subtitle="Acordos separados da empresa e do pessoal."/>
  <div className="quick"><Link href="/cadastros">Cadastrar recebível</Link><Link href="/assistente">Analisar com IA</Link></div>
  <div className="grid grid-4"><Metric label="Capital ativo" value={brl(principal)}/><Metric label="Receitas de juros no mês" value={brl(data.interest.income)} tone="positive"/><Metric label="A receber em aberto" value={brl(data.interest.openIn)}/><Metric label="Em atraso" value={brl(data.overdueReceivables)} tone={data.overdueReceivables>0?"warning":undefined}/></div>
  <SectionTitle title="Recebíveis do ambiente Juros"/>
  <div className="table-wrap"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Saldo</th><th>Status</th></tr></thead><tbody>
  {data.receivables.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="interest").map(x=><tr key={x.id}><td>{shortDate(x.due_date)}</td><td>{x.description}</td><td>{brl(Number(x.amount)-Number(x.received_amount))}</td><td>{x.status}</td></tr>)}
  {data.receivables.filter(x=>data.workspaceMap.get(x.workspace_id)?.kind==="interest").length===0&&<tr><td colSpan={4}>Nenhum recebível de juros cadastrado.</td></tr>}
  </tbody></table></div></>
}
