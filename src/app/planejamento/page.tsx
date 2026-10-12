import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate, workspaceLabel } from "@/lib/finance/format";
import { concluirLembrete } from "./actions";

export default async function Page() {
  const data = await getFinanceSnapshot();
  const monthlyExpenses = data.recurringEntries
    .filter((item) => item.active && item.type === "expense" && item.frequency === "monthly")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const monthlyIncome = data.recurringEntries
    .filter((item) => item.active && item.type === "income" && item.frequency === "monthly")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const forecast30 = data.cash + data.receivable30 - data.payable30;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const next30 = new Date(Date.parse(`${today}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  const pendingReminders = data.paymentReminders.filter((item) => item.status === "pending");
  const dueAlerts = pendingReminders.filter((item) => item.remind_on <= today);
  const upcomingPayables = data.payables.filter((item) => ["open", "partial", "overdue"].includes(item.status) && item.due_date <= next30).slice(0, 40);

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

      <SectionTitle title="Lembretes de pagamentos" hint={dueAlerts.length ? `${dueAlerts.length} aviso(s) aguardando atenção` : "avisos no próprio aplicativo"} />
      <div className="notice">
        Os lembretes são exibidos quando você acessa o Prime Finance. Alertas automáticos pelo WhatsApp ainda dependem da ativação da integração com a Meta. Marcar um lembrete como concluído não dá baixa financeira na conta.
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Descrição</th><th>Ambiente</th><th>Valor</th><th>Avisar em</th><th>Vencimento</th><th>Situação</th><th>Ação</th></tr></thead>
          <tbody>
            {pendingReminders.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{workspaceLabel(data.workspaceMap.get(item.workspace_id)?.kind ?? "")}</td>
                <td>{item.amount === null ? "Não informado" : brl(item.amount)}</td>
                <td>{shortDate(item.remind_on)}</td>
                <td>{shortDate(item.due_date)}</td>
                <td><span className={`badge ${item.remind_on <= today ? "orange" : "green"}`}>{item.remind_on <= today ? "Atenção" : "Agendado"}</span></td>
                <td>
                  <form action={concluirLembrete}>
                    <input type="hidden" name="reminder_id" value={item.id} />
                    <button className="button" type="submit">Concluir aviso</button>
                  </form>
                </td>
              </tr>
            ))}
            {pendingReminders.length === 0 && <tr><td colSpan={7}>Nenhum lembrete cadastrado. Você pode pedir à IA: "Me lembra do aluguel dia 20".</td></tr>}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Contas a pagar · próximos 30 dias" hint="inclui parcelas e boletos cadastrados" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Descrição</th><th>Ambiente</th><th>Vencimento</th><th>Saldo a pagar</th><th>Situação</th></tr></thead>
          <tbody>
            {upcomingPayables.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{workspaceLabel(data.workspaceMap.get(item.workspace_id)?.kind ?? "")}</td>
                <td>{shortDate(item.due_date)}</td>
                <td>{brl(Math.max(0, Number(item.amount) - Number(item.paid_amount)))}</td>
                <td><span className={`badge ${item.due_date < today ? "red" : "orange"}`}>{item.due_date < today ? "Atrasada" : "Em aberto"}</span></td>
              </tr>
            ))}
            {upcomingPayables.length === 0 && <tr><td colSpan={5}>Nenhuma conta a pagar próxima cadastrada.</td></tr>}
          </tbody>
        </table>
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
