import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { RecordControl } from "@/components/records/record-control";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setWhatsappReminderPreference } from "@/app/actions/local-records";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate, workspaceLabel } from "@/lib/finance/format";
import { concluirLembrete } from "./actions";

export default async function Page() {
  const data = await getFinanceSnapshot();
  const db=await createClient() as unknown as SupabaseClient;
  const {data:whatsappPref}=await db.from("whatsapp_reminder_preferences").select("enabled").eq("user_id",data.user.id).maybeSingle();
  const alertsOn=Boolean(whatsappPref?.enabled);
  const monthlyExpenses = data.recurringEntries
    .filter((item) => item.active && item.type === "expense" && item.frequency === "monthly")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const monthlyIncome = data.recurringEntries
    .filter((item) => item.active && item.type === "income" && item.frequency === "monthly")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const forecast30 = data.cash + data.receivable30 - data.payable30;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const next30 = new Date(Date.parse(`${today}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  const evolutionGoConfigured = process.env.WHATSAPP_PROVIDER === "evolution_go" &&
    Boolean(process.env.EVOLUTION_GO_API_URL && process.env.EVOLUTION_GO_INSTANCE_NAME && process.env.EVOLUTION_GO_TOKEN);
  const pendingReminders = data.paymentReminders.filter((item) => item.status === "pending");
  const dueAlerts = pendingReminders.filter((item) => item.remind_on <= today);
  const upcomingPayables = data.payables.filter((item) => ["open", "partial", "overdue"].includes(item.status) && item.due_date <= next30).slice(0, 40);

  return (
    <>
      <Header title="Planejamento" subtitle="Previsão de caixa, compromissos e recorrências." />
      <div className="record-toolbar">
        <RecordControl category="recurring" workspace="personal" label="Nova recorrência pessoal"/>
        <RecordControl category="recurring" workspace="prime" label="Nova recorrência Prime"/>
        <RecordControl category="payable" workspace="personal" label="Conta a pagar pessoal"/>
        <RecordControl category="payable" workspace="prime" label="Conta a pagar Prime"/>
        <RecordControl category="receivable" workspace="personal" label="Recebível pessoal"/>
        <RecordControl category="receivable" workspace="prime" label="Recebível Prime"/>
        <RecordControl category="reminder" workspace="personal" label="Novo lembrete"/>
      </div>

      <div className="grid grid-4">
        <Metric label="Caixa atual estimado" value={brl(data.cash)} />
        <Metric label="Previsão · 30 dias" value={brl(forecast30)} tone={forecast30 >= 0 ? "positive" : "warning"} />
        <Metric label="Fixos mensais" value={brl(monthlyExpenses)} />
        <Metric label="Receitas recorrentes" value={brl(monthlyIncome)} tone="positive" />
      </div>

      <SectionTitle title="Lembretes de pagamentos" hint={dueAlerts.length ? `${dueAlerts.length} aviso(s) aguardando atenção` : "avisos no próprio aplicativo"} />
      <div className="notice">
        {evolutionGoConfigured
          ? "O canal Evolution Go está configurado. Avisos automáticos são enviados pelo WhatsApp 3 dias antes e no dia do vencimento, para o número vinculado, quando estiverem ativados."
          : "O canal Evolution Go precisa estar configurado para enviar alertas automáticos; lembretes continuam disponíveis no aplicativo."}
        {" "}Finalizar um lembrete não dá baixa financeira na conta.
        <form action={setWhatsappReminderPreference} className="record-alert-settings">
          <span>Alertas no WhatsApp: <b>{alertsOn?"ativados":"desativados"}</b> • Envio diário às 7h (horário de Brasília)</span>
          <input type="hidden" name="enabled" value={alertsOn?"no":"yes"} />
          <button type="submit" className="button compact">{alertsOn?"Desativar avisos":"Ativar avisos"}</button>
        </form>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Descrição</th><th>Ambiente</th><th>Valor</th><th>Avisar em</th><th>Vencimento</th><th>Situação</th><th>Ações</th></tr></thead>
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
                    <button className="button compact" type="submit">Concluir aviso</button>
                  </form>
                  <RecordControl category="reminder" workspace={data.workspaceMap.get(item.workspace_id)?.kind as "prime"|"personal"|"interest"||"personal"} record={item}/>
                </td>
              </tr>
            ))}
            {pendingReminders.length === 0 && <tr><td colSpan={7}>Nenhum lembrete cadastrado. Você pode pedir à IA: &ldquo;Me lembra do aluguel dia 20&rdquo;.</td></tr>}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Contas a pagar · próximos 30 dias" hint="inclui parcelas e boletos cadastrados" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Descrição</th><th>Ambiente</th><th>Vencimento</th><th>Saldo a pagar</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>
            {upcomingPayables.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{workspaceLabel(data.workspaceMap.get(item.workspace_id)?.kind ?? "")}</td>
                <td>{shortDate(item.due_date)}</td>
                <td>{brl(Math.max(0, Number(item.amount) - Number(item.paid_amount)))}</td>
                <td><span className={`badge ${item.due_date < today ? "red" : "orange"}`}>{item.due_date < today ? "Atrasada" : "Em aberto"}</span></td>
                <td><RecordControl category="payable" workspace={data.workspaceMap.get(item.workspace_id)?.kind as "prime"|"personal"|"interest"||"personal"} record={item}/></td>
              </tr>
            ))}
            {upcomingPayables.length === 0 && <tr><td colSpan={6}>Nenhuma conta a pagar próxima cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Recorrências ativas" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ambiente</th><th>Descrição</th><th>Tipo</th><th>Frequência</th><th>Vencimento</th><th>Valor</th><th>Ações</th></tr></thead>
          <tbody>
            {data.recurringEntries.map((item) => (
              <tr key={item.id}>
                <td>{workspaceLabel(data.workspaceMap.get(item.workspace_id)?.kind ?? "")}</td>
                <td>{item.name}</td>
                <td>{item.type === "income" ? "Receita" : "Despesa"}</td>
                <td>{item.frequency}</td>
                <td>{item.due_day ? "dia " + item.due_day : "—"}</td>
                <td className={item.type === "income" ? "positive" : undefined}>{item.type === "expense" ? "− " : ""}{brl(item.amount)}</td>
                <td><RecordControl category="recurring" workspace={data.workspaceMap.get(item.workspace_id)?.kind as "prime"|"personal"|"interest"||"personal"} record={item}/></td>
              </tr>
            ))}
            {data.recurringEntries.length === 0 && <tr><td colSpan={7}>Nenhuma recorrência cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Recebíveis cadastrados" />
      <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Ambiente</th><th>Vencimento</th><th>Saldo a receber</th><th>Situação</th><th>Ações</th></tr></thead>
        <tbody>{data.receivables.filter(item=>["open","partial","overdue"].includes(item.status)).slice(0,40).map(item=><tr key={item.id}>
          <td>{item.description}</td><td>{workspaceLabel(data.workspaceMap.get(item.workspace_id)?.kind??"")}</td>
          <td>{shortDate(item.due_date)}</td><td>{brl(Math.max(0,Number(item.amount)-Number(item.received_amount)))}</td>
          <td>{item.status}</td>
          <td><RecordControl category="receivable" workspace={data.workspaceMap.get(item.workspace_id)?.kind as "prime"|"personal"|"interest"||"personal"} record={item}/></td>
        </tr>)}</tbody></table></div>
      <SectionTitle title="Risco imediato" />
      <div className="grid grid-2">
        <Metric label="A receber em atraso" value={brl(data.overdueReceivables)} tone={data.overdueReceivables > 0 ? "warning" : undefined} />
        <Metric label="A pagar em atraso" value={brl(data.overduePayables)} tone={data.overduePayables > 0 ? "warning" : undefined} />
      </div>
    </>
  );
}
