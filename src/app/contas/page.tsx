import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, workspaceLabel } from "@/lib/finance/format";

export default async function Page(){
  const data=await getFinanceSnapshot();
  return <><Header title="Contas" subtitle="Bancos, carteiras e base para conciliação."/>
  <div className="quick"><Link href="/cadastros">Cadastrar conta</Link><Link href="/cadastros">Registrar movimentação</Link></div>
  <div className="grid grid-4"><Metric label="Caixa consolidado" value={brl(data.cash)}/><Metric label="Contas cadastradas" value={String(data.accounts.length)}/><Metric label="A receber · 30 dias" value={brl(data.receivable30)} tone="positive"/><Metric label="A pagar · 30 dias" value={brl(data.payable30)} tone={data.payable30>0?"warning":undefined}/></div>
  <SectionTitle title="Contas cadastradas"/>
  <div className="table-wrap"><table><thead><tr><th>Conta</th><th>Ambiente</th><th>Instituição</th><th>Tipo</th><th>Saldo inicial</th></tr></thead><tbody>
  {data.accounts.map(x=><tr key={x.id}><td>{x.name}</td><td>{workspaceLabel(data.workspaceMap.get(x.workspace_id)?.kind??"")}</td><td>{x.institution??"—"}</td><td>{x.account_type}</td><td>{brl(x.opening_balance)}</td></tr>)}
  {data.accounts.length===0&&<tr><td colSpan={5}>Nenhuma conta cadastrada.</td></tr>}
  </tbody></table></div>
  <SectionTitle title="Conciliação"/>
  <div className="notice">Quando Open Finance/OFX for ligado, movimentos bancários devem ser pareados com lançamentos existentes antes de criar novos registros, evitando duplicidade.</div></>
}
