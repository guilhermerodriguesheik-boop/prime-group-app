import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, workspaceLabel } from "@/lib/finance/format";

export default async function Page() {
  const data = await getFinanceSnapshot();
  const monthlyExpenses = data.recurringEntries
    .filter((item) => item.active && item.type === "expense" && item.frequency === "monthly")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const monthlyIncome = data.recurringEntries
    .filter((item) => item.active && item.type === "income" && item.frequency === "monthly")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const forecast30 = data.cash + data.receivable30 - data.payable30;

  return (
    <>
      <Header title="Planejamento" subtitle="Previsão de caixa, compromissos e recorrências." />
      <div className="quick">
        <Link href="/cadastros">Nova recorrência</Link>
        <Link href="/cadastros">Nova conta a pagar</Link>
        <Link href="/cadastros">Novo recebível</Link>
      </div>

      <div className="grid grid-4">
        <Metric label="Caixa atual estimado" value={brl(data.cash)} />
        <Metric label="Previsão · 30 dias" value={brl(forecast30)} tone={forecast30 >= 0 ? "positive" : "warning"} />
        <Metric label="Fixos mensais" value={brl(monthlyExpenses)} />
        <Metric label="Receitas recorrentes" value={brl(monthlyIncome)} tone="positive" />
      </div>

      <SectionTitle title="Recorrências ativas" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ambiente</th><th>Descrição</th><th>Tipo</th><th>Frequência</th><th>Vencimento</th><th>Valor</th></tr></thead>
          <tbody>
            {data.recurringEntries.map((item) => (
              <tr key={item.id}>
                <td>{workspaceLabel(data.workspaceMap.get(item.workspace_id)?.kind ?? "")}</td>
                <td>{item.name}</td>
                <td>{item.type === "income" ? "Receita" : "Despesa"}</td>
                <td>{item.frequency}</td>
                <td>{item.due_day ? "dia " + item.due_day : "—"}</td>
                <td className={item.type === "income" ? "positive" : undefined}>{item.type === "expense" ? "− " : ""}{brl(item.amount)}</td>
              </tr>
            ))}
            {data.recurringEntries.length === 0 && <tr><td colSpan={6}>Nenhuma recorrência cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Risco imediato" />
      <div className="grid grid-2">
        <Metric label="A receber em atraso" value={brl(data.overdueReceivables)} tone={data.overdueReceivables > 0 ? "warning" : undefined} />
        <Metric label="A pagar em atraso" value={brl(data.overduePayables)} tone={data.overduePayables > 0 ? "warning" : undefined} />
      </div>
    </>
  );
}
