import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, pct } from "@/lib/finance/format";

export default async function Page(){
  const data=await getFinanceSnapshot();
  const fleetValue=data.vehicles.reduce((sum,x)=>sum+Number(x.estimated_value??0),0);
  return <><Header title="Frota" subtitle="Rentabilidade, custos e ativos por veículo."/>
  <div className="quick"><Link href="/cadastros">Cadastrar veículo</Link><Link href="/cadastros">Lançar custo</Link><Link href="/viagens">Ver viagens</Link></div>
  <div className="grid grid-4"><Metric label="Veículos ativos" value={String(data.vehicles.filter(x=>x.status==="active").length)}/><Metric label="Valor estimado" value={brl(fleetValue)}/><Metric label="Receita vinculada no mês" value={brl(data.vehicleResults.reduce((s,x)=>s+x.income,0))}/><Metric label="Lucro vinculado no mês" value={brl(data.vehicleResults.reduce((s,x)=>s+x.profit,0))} tone="positive"/></div>
  <SectionTitle title="Resultado por veículo"/>
  <div className="table-wrap"><table><thead><tr><th>Veículo</th><th>Status</th><th>Receita</th><th>Custo</th><th>Lucro</th><th>Margem</th></tr></thead><tbody>
  {data.vehicleResults.map(x=><tr key={x.id}><td><b>{x.nickname}</b><div className="metric-foot">{x.plate??"sem placa"} · {x.model??""}</div></td><td>{x.status}</td><td>{brl(x.income)}</td><td>{brl(x.expense)}</td><td className={x.profit>=0?"positive":"warning"}>{brl(x.profit)}</td><td>{x.income>0?pct(x.profit/x.income):"—"}</td></tr>)}
  {data.vehicleResults.length===0&&<tr><td colSpan={6}>Nenhum veículo cadastrado.</td></tr>}
  </tbody></table></div></>
}
