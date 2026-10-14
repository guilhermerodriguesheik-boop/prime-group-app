import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, pct, workspaceLabel } from "@/lib/finance/format";
import {PremiumTrend,makeWeeklyTrend} from "@/components/premium/analytics";

export default async function Page() {
  const data = await getFinanceSnapshot();
  const totalIncome = data.prime.income + data.personal.income + data.interest.income;
  const totalExpense = data.prime.expense + data.personal.expense + data.interest.expense;
  const result = totalIncome - totalExpense;

  return (
    <>
      <Header title="Relatórios" subtitle="Leitura gerencial do mês e exportação dos dados." />
      <div className="quick">
        <Link href="/api/export/transactions">Exportar lançamentos CSV</Link>
        <Link href="/planejamento">Ver planejamento</Link>
        <Link href="/assistente">Analisar com IA</Link><Link href="/configuracoes">Configurar relatórios pelo WhatsApp</Link>
      </div>

      <div className="grid grid-4">
        <Metric label="Receitas do mês" value={brl(totalIncome)} tone="positive" />
        <Metric label="Despesas do mês" value={brl(totalExpense)} />
        <Metric label="Resultado consolidado" value={brl(result)} tone={result >= 0 ? "positive" : "warning"} />
        <Metric label="Margem consolidada" value={totalIncome > 0 ? pct(result / totalIncome) : "—"} />
      </div>

<div className="premium-analytics-grid"><PremiumTrend title="Tendência da Prime Group" points={makeWeeklyTrend(data.transactions,new Set(data.workspaces.filter(w=>w.kind==="prime").map(w=>w.id)))}/>
  <PremiumTrend title="Tendência pessoal" points={makeWeeklyTrend(data.transactions,new Set(data.workspaces.filter(w=>w.kind==="personal").map(w=>w.id)))}/></div>
  <div className="notice">Relatórios programados para sábado e último dia do mês às 20h50 (Brasília). Resultado gerencial baseado em lançamentos confirmados, sujeito ao horário de corte. Extratos ainda em conferência não são considerados como lucro.</div>
  <SectionTitle title="Resultado por ambiente" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ambiente</th><th>Receitas</th><th>Despesas</th><th>Resultado</th><th>Margem</th></tr></thead>
          <tbody>
            {[
              ["prime", data.prime],
              ["personal", data.personal],
              ["interest", data.interest],
            ].map(([kind, totals]) => {
              const item = totals as typeof data.prime;
              return (
                <tr key={kind as string}>
                  <td>{workspaceLabel(kind as string)}</td>
                  <td>{brl(item.income)}</td>
                  <td>{brl(item.expense)}</td>
                  <td className={item.result >= 0 ? "positive" : "warning"}>{brl(item.result)}</td>
                  <td>{item.income > 0 ? pct(item.result / item.income) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Rentabilidade da frota" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Veículo</th><th>Receita</th><th>Custo</th><th>Lucro</th><th>Margem</th></tr></thead>
          <tbody>
            {data.vehicleResults.map((vehicle) => (
              <tr key={vehicle.id}>
                <td>{vehicle.nickname}</td>
                <td>{brl(vehicle.income)}</td>
                <td>{brl(vehicle.expense)}</td>
                <td className={vehicle.profit >= 0 ? "positive" : "warning"}>{brl(vehicle.profit)}</td>
                <td>{vehicle.income > 0 ? pct(vehicle.profit / vehicle.income) : "—"}</td>
              </tr>
            ))}
            {data.vehicleResults.length === 0 && <tr><td colSpan={5}>Sem dados de frota para o período.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
