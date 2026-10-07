import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate } from "@/lib/finance/format";

export default async function Page(){
  const data=await getFinanceSnapshot();
  const completed=data.trips.filter(x=>x.status==="completed");
  const revenue=completed.reduce((s,x)=>s+Number(x.freight_revenue),0);
  const km=completed.reduce((s,x)=>s+Number(x.distance_km??0),0);
  return <><Header title="Viagens e CT-e" subtitle="Operações ligadas a receita, custos e frota."/>
  <div className="grid grid-4"><Metric label="Viagens concluídas" value={String(completed.length)}/><Metric label="Receita informada" value={brl(revenue)}/><Metric label="KM concluídos" value={km.toLocaleString("pt-BR")}/><Metric label="Ticket médio" value={brl(completed.length?revenue/completed.length:0)}/></div>
  <SectionTitle title="Últimas viagens"/>
  <div className="table-wrap"><table><thead><tr><th>Data</th><th>Referência</th><th>Rota</th><th>KM</th><th>Receita</th><th>Status</th></tr></thead><tbody>
  {data.trips.map(x=><tr key={x.id}><td>{shortDate(x.started_at)}</td><td>{x.reference??"—"}</td><td>{x.origin??"—"} → {x.destination??"—"}</td><td>{Number(x.distance_km??0).toLocaleString("pt-BR")}</td><td>{brl(x.freight_revenue)}</td><td>{x.status}</td></tr>)}
  {data.trips.length===0&&<tr><td colSpan={6}>Nenhuma viagem real cadastrada ainda.</td></tr>}
  </tbody></table></div>
  <SectionTitle title="Integração"/>
  <div className="notice">Cargozilla → CT-e → viagem → despesas → recebimento → lucro final. A estrutura de banco já está pronta; falta apenas conectar a API/arquivo do Cargozilla.</div></>
}
