import { Header, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate, workspaceLabel } from "@/lib/finance/format";
import { createAccount, createPayable, createReceivable, createTransaction, createVehicle } from "./actions";

const workspaceOptions = [
  ["prime", "Prime Group"],
  ["personal", "Pessoal"],
  ["interest", "Recebíveis / Juros"],
];

export default async function Page() {
  const data = await getFinanceSnapshot();

  return (
    <>
      <Header title="Cadastros" subtitle="Lançamentos rápidos gravados diretamente no Supabase." />

      <div className="grid grid-2">
        <form action={createTransaction} className="card form-grid">
          <h3>Receita ou despesa realizada</h3>
          <select name="workspace" required>{workspaceOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select name="type" required><option value="expense">Despesa</option><option value="income">Receita</option></select>
          <input name="description" placeholder="Descrição" required />
          <input name="amount" inputMode="decimal" placeholder="Valor, ex.: 450,00" required />
          <input name="occurred_at" type="date" required />
          <select name="account_id"><option value="">Sem conta vinculada</option>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select name="vehicle_id"><option value="">Sem veículo</option>{data.vehicles.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}</select>
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
          {data.receivables.slice(0, 6).map((item) => <div className="list-row" key={item.id}><span>{shortDate(item.due_date)} · {item.description}</span><b>{brl(Number(item.amount)-Number(item.received_amount))}</b></div>)}
          {data.receivables.length === 0 && <div className="metric-foot">Nenhum recebível cadastrado.</div>}
        </div>
        <div className="card">
          <h3>A pagar</h3>
          {data.payables.slice(0, 6).map((item) => <div className="list-row" key={item.id}><span>{shortDate(item.due_date)} · {item.description}</span><b>{brl(Number(item.amount)-Number(item.paid_amount))}</b></div>)}
          {data.payables.length === 0 && <div className="metric-foot">Nenhuma conta cadastrada.</div>}
        </div>
      </div>
    </>
  );
}
