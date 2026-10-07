import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, workspaceLabel } from "@/lib/finance/format";

export default async function Page(){
  const data=await getFinanceSnapshot();
  const totalLimit=data.cards.reduce((sum,card)=>sum+Number(card.credit_limit??0),0);
  const cardOpen=(cardId:string)=>{
    const purchases=data.transactions.filter(x=>x.card_id===cardId&&x.type==="expense").reduce((s,x)=>s+Number(x.amount),0);
    const payments=data.transactions.filter(x=>x.card_id===cardId&&x.type==="card_payment").reduce((s,x)=>s+Number(x.amount),0);
    return Math.max(0,purchases-payments);
  };
  const totalOpen=data.cards.reduce((sum,card)=>sum+cardOpen(card.id),0);
  return <><Header title="Contas e cartões" subtitle="Bancos, carteiras, cartões e base para conciliação."/>
  <div className="quick"><Link href="/cadastros">Cadastrar conta ou cartão</Link><Link href="/cadastros">Registrar movimentação</Link><Link href="/planejamento">Planejamento</Link></div>
  <div className="grid grid-4"><Metric label="Caixa consolidado" value={brl(data.cash)}/><Metric label="Contas cadastradas" value={String(data.accounts.length)}/><Metric label="Faturas em aberto" value={brl(totalOpen)} tone={totalOpen>0?"warning":undefined}/><Metric label="Limite total informado" value={brl(totalLimit)}/></div>

  <SectionTitle title="Contas cadastradas"/>
  <div className="table-wrap"><table><thead><tr><th>Conta</th><th>Ambiente</th><th>Instituição</th><th>Tipo</th><th>Saldo inicial</th></tr></thead><tbody>
  {data.accounts.map(x=><tr key={x.id}><td>{x.name}</td><td>{workspaceLabel(data.workspaceMap.get(x.workspace_id)?.kind??"")}</td><td>{x.institution??"—"}</td><td>{x.account_type}</td><td>{brl(x.opening_balance)}</td></tr>)}
  {data.accounts.length===0&&<tr><td colSpan={5}>Nenhuma conta cadastrada.</td></tr>}
  </tbody></table></div>

  <SectionTitle title="Cartões"/>
  <div className="table-wrap"><table><thead><tr><th>Cartão</th><th>Ambiente</th><th>Emissor</th><th>Final</th><th>Fecha</th><th>Vence</th><th>Fatura aberta</th><th>Limite</th></tr></thead><tbody>
  {data.cards.map(x=><tr key={x.id}><td>{x.name}</td><td>{workspaceLabel(data.workspaceMap.get(x.workspace_id)?.kind??"")}</td><td>{x.issuer??"—"}</td><td>{x.last4??"—"}</td><td>{x.closing_day??"—"}</td><td>{x.due_day??"—"}</td><td className={cardOpen(x.id)>0?"warning":undefined}>{brl(cardOpen(x.id))}</td><td>{brl(x.credit_limit)}</td></tr>)}
  {data.cards.length===0&&<tr><td colSpan={8}>Nenhum cartão cadastrado.</td></tr>}
  </tbody></table></div>

  <SectionTitle title="Conciliação"/>
  <div className="notice">Quando Open Finance/OFX for ligado, movimentos bancários devem ser pareados com lançamentos existentes antes de criar novos registros, evitando duplicidade. Pagamento de fatura deve ser tratado como transferência, não como nova despesa.</div></>
}
