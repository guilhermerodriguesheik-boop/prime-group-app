import { Header, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate, workspaceLabel } from "@/lib/finance/format";
import { createAccount, createCard, createCounterparty, createLoan, createPayable, createReceivable, createRecurringEntry, createTransaction, createVehicle, settlePayable, settleReceivable } from "./actions";

const workspaceOptions = [
  ["prime", "Prime Group"],
  ["personal", "Pessoal"],
  ["interest", "Recebíveis / Juros"],
];

export default async function Page() {
  const data = await getFinanceSnapshot();
  const interestPeople = data.counterparties.filter((item) => data.workspaceMap.get(item.workspace_id)?.kind === "interest");

  return (
    <>
      <Header title="Cadastros" subtitle="Lançamentos rápidos gravados diretamente no Supabase." />

      <div className="grid grid-2">
        <form action={createTransaction} className="card form-grid">
          <h3>Receita ou despesa realizada</h3>
          <select name="workspace" required>{workspaceOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select name="entry_mode" required>
            <option value="expense">Despesa paga à vista / conta</option>
            <option value="income">Receita recebida</option>
            <option value="card_purchase">Compra no cartão</option>
            <option value="card_payment">Pagamento de fatura</option>
          </select>
          <input name="description" placeholder="Descrição" required />
          <input name="amount" inputMode="decimal" placeholder="Valor, ex.: 450,00" required />
          <input name="occurred_at" type="date" required />
          <select name="account_id"><option value="">Sem conta vinculada</option>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {workspaceLabel(data.workspaceMap.get(item.workspace_id)?.kind ?? "")}</option>)}</select>
          <select name="card_id"><option value="">Sem cartão</option>{data.cards.map((item) => <option key={item.id} value={item.id}>{item.name} · {workspaceLabel(data.workspaceMap.get(item.workspace_id)?.kind ?? "")}</option>)}</select>
          <select name="vehicle_id"><option value="">Sem veículo</option>{data.vehicles.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}</select>
          <div className="metric-foot">Compra no cartão conta como despesa, mas só reduz o caixa quando a fatura for paga.</div>
          <button className="button primary" type="submit">Salvar lançamento</button>
        </form>

        <form action={createReceivable} className="card form-grid">
          <h3>Conta a receber</h3>
          <select name="workspace" required>{workspaceOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input name="description" placeholder="Quem paga / descrição" required />
          <input name="amount" inputMode="decimal" placeholder="Valor" required />
          <input name="due_date" type="date" required />
          <button className="button primary" type="submit">Cadastrar recebível</button>
        </form>

        <form action={createPayable} className="card form-grid">
          <h3>Conta a pagar</h3>
          <select name="workspace" required>{workspaceOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input name="description" placeholder="Fornecedor / descrição" required />
          <input name="amount" inputMode="decimal" placeholder="Valor" required />
          <input name="due_date" type="date" required />
          <button className="button primary" type="submit">Cadastrar conta</button>
        </form>

        <form action={createAccount} className="card form-grid">
          <h3>Conta ou carteira</h3>
          <select name="workspace" required>{workspaceOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input name="name" placeholder="Nome da conta" required />
          <input name="institution" placeholder="Banco / instituição" />
          <select name="account_type"><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Dinheiro</option><option value="wallet">Carteira digital</option><option value="investment">Investimento</option><option value="other">Outra</option></select>
          <input name="opening_balance" inputMode="decimal" placeholder="Saldo inicial" defaultValue="0" />
          <button className="button primary" type="submit">Cadastrar conta</button>
        </form>


        <form action={createCard} className="card form-grid">
          <h3>Cartão de crédito</h3>
          <select name="workspace" required>{workspaceOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input name="name" placeholder="Nome do cartão" required />
          <input name="issuer" placeholder="Emissor / banco" />
          <input name="last4" inputMode="numeric" maxLength={4} placeholder="Últimos 4 dígitos" />
          <select name="account_id"><option value="">Sem conta de pagamento vinculada</option>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <input name="closing_day" inputMode="numeric" placeholder="Dia do fechamento" />
          <input name="due_day" inputMode="numeric" placeholder="Dia do vencimento" />
          <input name="credit_limit" inputMode="decimal" placeholder="Limite" />
          <button className="button primary" type="submit">Cadastrar cartão</button>
        </form>

        <form action={createRecurringEntry} className="card form-grid">
          <h3>Receita ou despesa recorrente</h3>
          <select name="workspace" required>{workspaceOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select name="type"><option value="expense">Despesa</option><option value="income">Receita</option></select>
          <input name="name" placeholder="Descrição" required />
          <input name="amount" inputMode="decimal" placeholder="Valor" required />
          <select name="frequency"><option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="quarterly">Trimestral</option><option value="yearly">Anual</option><option value="custom">Personalizado</option></select>
          <input name="due_day" inputMode="numeric" placeholder="Dia do vencimento" />
          <input name="starts_on" type="date" required />
          <input name="ends_on" type="date" />
          <button className="button primary" type="submit">Cadastrar recorrência</button>
        </form>

        <form action={createVehicle} className="card form-grid">
          <h3>Veículo</h3>
          <input name="nickname" placeholder="Nome, ex.: VW 12.170" required />
          <input name="plate" placeholder="Placa" />
          <input name="make" placeholder="Marca" />
          <input name="model" placeholder="Modelo" />
          <input name="year" inputMode="numeric" placeholder="Ano" />
          <input name="odometer_km" inputMode="decimal" placeholder="Hodômetro atual" />
          <input name="estimated_value" inputMode="decimal" placeholder="Valor estimado" />
          <button className="button primary" type="submit">Cadastrar veículo</button>
        </form>

        <form action={createCounterparty} className="card form-grid">
          <h3>Pessoa ou empresa</h3>
          <select name="workspace" required>{workspaceOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select name="kind"><option value="customer">Cliente</option><option value="supplier">Fornecedor</option><option value="borrower">Devedor / tomador</option><option value="lender">Credor</option><option value="driver">Motorista</option><option value="other">Outro</option></select>
          <input name="name" placeholder="Nome" required />
          <input name="document" placeholder="CPF/CNPJ" />
          <input name="phone" placeholder="Telefone" />
          <input name="email" type="email" placeholder="Email" />
          <button className="button primary" type="submit">Cadastrar pessoa/empresa</button>
        </form>

        <form action={createLoan} className="card form-grid">
          <h3>Contrato de juros a receber</h3>
          <select name="counterparty_id" required><option value="">Selecione o devedor</option>{interestPeople.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <input name="principal" inputMode="decimal" placeholder="Capital principal" required />
          <select name="interest_type"><option value="simple">Juros simples</option><option value="compound">Juros compostos</option><option value="fixed">Juros fixos</option><option value="manual">Manual</option></select>
          <input name="periodic_rate" inputMode="decimal" placeholder="Taxa por período, ex.: 5 para 5%" />
          <select name="rate_period"><option value="month">Ao mês</option><option value="week">Por semana</option><option value="day">Ao dia</option><option value="year">Ao ano</option></select>
          <input name="fixed_interest" inputMode="decimal" placeholder="Juros fixos em R$ (se aplicável)" />
          <input name="start_date" type="date" required />
          <input name="maturity_date" type="date" />
          <select name="installment_frequency"><option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="custom">Personalizado</option></select>
          <input name="notes" placeholder="Observações" />
          <button className="button primary" type="submit" disabled={interestPeople.length === 0}>Cadastrar contrato</button>
          {interestPeople.length === 0 && <div className="metric-foot">Cadastre primeiro a pessoa no ambiente Recebíveis / Juros.</div>}
        </form>
      </div>

      <SectionTitle title="Últimos lançamentos" hint="realizados" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Ambiente</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead>
          <tbody>
            {data.transactions.slice(0, 12).map((item) => (
              <tr key={item.id}>
                <td>{shortDate(item.occurred_at)}</td>
                <td>{workspaceLabel(data.workspaceMap.get(item.workspace_id)?.kind ?? "")}</td>
                <td>{item.description}</td>
                <td>{item.type === "income" ? "Receita" : item.type === "expense" ? "Despesa" : item.type}</td>
                <td className={item.type === "income" ? "positive" : undefined}>{item.type === "expense" ? "− " : ""}{brl(item.amount)}</td>
              </tr>
            ))}
            {data.transactions.length === 0 && <tr><td colSpan={5}>Nenhum lançamento real ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Próximos vencimentos" />
      <div className="grid grid-2">
        <div className="card">
          <h3>A receber</h3>
          {data.receivables.filter((item) => ["open","partial","overdue"].includes(item.status)).slice(0, 6).map((item) => <div className="list-row" key={item.id}><span>{shortDate(item.due_date)} · {item.description}</span><span className="row-actions"><b>{brl(Number(item.amount)-Number(item.received_amount))}</b><form action={settleReceivable.bind(null,item.id)}><button className="button compact" type="submit">Receber</button></form></span></div>)}
          {data.receivables.length === 0 && <div className="metric-foot">Nenhum recebível cadastrado.</div>}
        </div>
        <div className="card">
          <h3>A pagar</h3>
          {data.payables.filter((item) => ["open","partial","overdue"].includes(item.status)).slice(0, 6).map((item) => <div className="list-row" key={item.id}><span>{shortDate(item.due_date)} · {item.description}</span><span className="row-actions"><b>{brl(Number(item.amount)-Number(item.paid_amount))}</b><form action={settlePayable.bind(null,item.id)}><button className="button compact" type="submit">Pagar</button></form></span></div>)}
          {data.payables.length === 0 && <div className="metric-foot">Nenhuma conta cadastrada.</div>}
        </div>
      </div>
    </>
  );
}
