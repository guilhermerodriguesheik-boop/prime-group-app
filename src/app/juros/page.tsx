import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate } from "@/lib/finance/format";

const periodNames: Record<string, string> = {
  day: "ao dia", week: "por semana", month: "ao mês", year: "ao ano",
};
const typeNames: Record<string, string> = {
  simple: "simples", compound: "compostos", fixed: "fixos", manual: "a definir",
};

export default async function Page() {
  const data = await getFinanceSnapshot();
  const people = new Map(data.counterparties.map((item) => [item.id, item.name]));
  const loans = data.loans.filter((item) => item.direction === "receivable" && item.status !== "cancelled");
  const paymentsFor = (id: string) => data.loanPayments.filter((payment) => payment.loan_id === id);
  const capitalOutstanding = loans.filter((loan) => loan.status === "active").reduce((sum, loan) => {
    const principalPaid = paymentsFor(loan.id).reduce((a, p) => a + Number(p.principal_amount), 0);
    return sum + Math.max(0, Number(loan.principal) - principalPaid);
  }, 0);
  const actualPayments = data.loanPayments.filter((p) => loans.some((loan) => loan.id === p.loan_id));
  const totalInterestReceived = actualPayments.reduce((sum, payment) => sum + Number(payment.interest_amount), 0);
  const totalPrincipalPaid = actualPayments.reduce((sum, payment) => sum + Number(payment.principal_amount), 0);
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  return (
    <>
      <Header title="Empréstimos e juros" subtitle="Capital emprestado, amortizações, juros recebidos e vencimentos separados da Prime Group e das contas pessoais." />
      <div className="quick">
        <Link href="/assistente">Conversar com a IA</Link>
        <Link href="/cadastros">Cadastrar pelo formulário</Link>
        <Link href="/planejamento">Lembretes de cobrança</Link>
      </div>

      <div className="notice">
        Pode escrever à IA: &ldquo;Emprestei 10 mil ao João a 5% ao mês, vencendo em 20/11&rdquo; ou &ldquo;João me pagou 500 só de juros hoje&rdquo;.
        Capital emprestado e capital devolvido movimentam o caixa, mas não contam como lucro. Apenas juros e taxas recebidos entram no resultado.
        Se a divisão entre juros e amortização não estiver clara, a IA perguntará.
      </div>

      <div className="grid grid-4">
        <Metric label="Capital ainda a receber" value={brl(capitalOutstanding)} tone="warning" />
        <Metric label="Capital já amortizado" value={brl(totalPrincipalPaid)} />
        <Metric label="Juros recebidos (acumulados)" value={brl(totalInterestReceived)} tone="positive" />
        <Metric label="Juros e taxas no mês" value={brl(data.interest.income)} tone="positive" />
      </div>

      <SectionTitle title="Empréstimos cadastrados" />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Devedor</th><th>Capital original</th><th>Capital devolvido</th>
              <th>Capital devedor</th><th>Taxa combinada</th><th>Início</th>
              <th>Vencimento</th><th>Situação</th></tr>
          </thead>
          <tbody>
            {loans.map((loan) => {
              const repaid = paymentsFor(loan.id).reduce((sum, p) => sum + Number(p.principal_amount), 0);
              const outstanding = Math.max(0, Number(loan.principal) - repaid);
              const rate = loan.interest_type === "fixed"
                ? brl(loan.fixed_interest) + " fixos"
                : loan.periodic_rate !== null
                  ? Number(loan.periodic_rate).toLocaleString("pt-BR") + "% " + (periodNames[loan.rate_period ?? ""] ?? "") + " (" + (typeNames[loan.interest_type] ?? loan.interest_type) + ")"
                  : "A definir";
              const expired = loan.maturity_date && loan.maturity_date < today && outstanding > 0;
              return (
                <tr key={loan.id}>
                  <td>{people.get(loan.counterparty_id) ?? "—"}</td>
                  <td>{brl(loan.principal)}</td>
                  <td>{brl(repaid)}</td>
                  <td>{brl(outstanding)}</td>
                  <td>{rate}</td>
                  <td>{shortDate(loan.start_date)}</td>
                  <td>{loan.maturity_date ? shortDate(loan.maturity_date) : "Não informado"}</td>
                  <td>
                    <span className={"badge " + (expired ? "red" : loan.status === "active" ? "orange" : "green")}>
                      {expired ? "Vencido" : loan.status === "draft" ? "Planejado" : loan.status === "settled" ? "Quitado" : "Ativo"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {loans.length === 0 && <tr><td colSpan={8}>Nenhum empréstimo cadastrado. Inicie uma conversa com a IA ou use o formulário.</td></tr>}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Recebimentos dos empréstimos" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Devedor</th><th>Valor recebido</th><th>Capital</th><th>Juros</th><th>Taxas</th></tr></thead>
          <tbody>
            {actualPayments.map((payment) => {
              const loan = loans.find((item) => item.id === payment.loan_id);
              return (
                <tr key={payment.id}>
                  <td>{shortDate(payment.paid_at)}</td>
                  <td>{loan ? people.get(loan.counterparty_id) ?? "—" : "—"}</td>
                  <td>{brl(payment.amount)}</td>
                  <td>{brl(payment.principal_amount)}</td>
                  <td className="positive">{brl(payment.interest_amount)}</td>
                  <td>{brl(payment.fees_amount)}</td>
                </tr>
              );
            })}
            {actualPayments.length === 0 && <tr><td colSpan={6}>Nenhum pagamento de empréstimo registrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Parcelas informadas no contrato" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Devedor</th><th>Parcela</th><th>Vencimento</th><th>Capital previsto</th><th>Juros previstos</th><th>Pago</th><th>Status</th></tr></thead>
          <tbody>
            {data.loanInstallments.filter((i) => loans.some((loan) => loan.id === i.loan_id)).map((item) => {
              const loan = loans.find((row) => row.id === item.loan_id);
              return (
                <tr key={item.id}>
                  <td>{loan ? people.get(loan.counterparty_id) ?? "—" : "—"}</td>
                  <td>{item.installment_number}</td>
                  <td>{shortDate(item.due_date)}</td>
                  <td>{brl(item.principal_due)}</td>
                  <td>{brl(item.interest_due)}</td>
                  <td>{brl(item.paid_amount)}</td>
                  <td>{item.status}</td>
                </tr>
              );
            })}
            {data.loanInstallments.length === 0 && <tr><td colSpan={7}>Nenhum cronograma de parcelas informado. A IA não cria parcelas presumidas; vencimentos dos contratos estão acima.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
