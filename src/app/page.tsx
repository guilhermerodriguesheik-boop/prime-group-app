import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, pct, shortDate, workspaceLabel } from "@/lib/finance/format";

export default async function Home() {
  const data = await getFinanceSnapshot();

  return (
    <>
      <Header title="Visão geral" subtitle="Prime + pessoal + recebíveis, sem misturar as contabilidades." />
      <div className="grid grid-4">
        <Metric label="Caixa consolidado" value={brl(data.cash)} foot="saldo inicial + movimentos realizados" />
        <Metric label="A receber · 30 dias" value={brl(data.receivable30)} foot="recebíveis em aberto" tone="positive" />
        <Metric label="A pagar · 30 dias" value={brl(data.payable30)} foot="obrigações em aberto" tone={data.payable30 > 0 ? "warning" : undefined} />
        <Metric label="Resultado do mês" value={brl(data.prime.result + data.personal.result + data.interest.result)} foot="receitas menos despesas realizadas" tone={(data.prime.result + data.personal.result + data.interest.result) >= 0 ? "positive" : "warning"} />
      </div>

      {(data.overdueReceivables > 0 || data.overduePayables > 0) && (
        <div className="notice attention">
          <b>Atenção:</b> {data.overdueReceivables > 0 ? `${brl(data.overdueReceivables)} a receber em atraso. ` : ""}
          {data.overduePayables > 0 ? `${brl(data.overduePayables)} a pagar em atraso.` : ""}
        </div>
      )}

      <SectionTitle title="Separação financeira" hint="consolidado apenas para análise" />
      <div className="grid grid-3">
        {[
          ["Prime Group", data.prime],
          ["Pessoal", data.personal],
          ["Recebíveis / Juros", data.interest],
        ].map(([label, totals]) => {
          const item = totals as typeof data.prime;
          return <div className="card" key={label as string}><h3>{label as string}</h3><div className="metric-value">{brl(item.result)}</div><div className="mini-grid"><div className="mini">Receitas<b>{brl(item.income)}</b></div><div className="mini">Despesas<b>{brl(item.expense)}</b></div><div className="mini">A receber<b>{brl(item.openIn)}</b></div><div className="mini">A pagar<b>{brl(item.openOut)}</b></div></div></div>;
        })}
      </div>

      <SectionTitle title="Frota · resultado do mês" hint="lançamentos vinculados ao veículo" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Veículo</th><th>Receita</th><th>Custo</th><th>Lucro</th><th>Margem</th></tr></thead>
          <tbody>
            {data.vehicleResults.map((vehicle) => (
              <tr key={vehicle.id}>
                <td><b>{vehicle.nickname}</b><div className="metric-foot">{vehicle.plate ?? "sem placa"}</div></td>
                <td>{brl(vehicle.income)}</td>
                <td>{brl(vehicle.expense)}</td>
                <td className={vehicle.profit >= 0 ? "positive" : "warning"}>{brl(vehicle.profit)}</td>
                <td>{vehicle.income > 0 ? pct(vehicle.profit / vehicle.income) : "—"}</td>
              </tr>
            ))}
            {data.vehicleResults.length === 0 && <tr><td colSpan={5}>Nenhum veículo cadastrado. <Link href="/cadastros">Cadastrar agora</Link>.</td></tr>}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Próximos recebimentos" hint="planejamento por vencimento" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Origem</th><th>Ambiente</th><th>Vencimento</th><th>Saldo</th><th>Status</th></tr></thead>
          <tbody>
            {data.receivables.filter((item) => ["open","partial","overdue"].includes(item.status)).slice(0,8).map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{workspaceLabel(data.workspaceMap.get(item.workspace_id)?.kind ?? "")}</td>
                <td>{shortDate(item.due_date)}</td>
                <td>{brl(Number(item.amount)-Number(item.received_amount))}</td>
                <td><span className={`badge ${item.status === "overdue" ? "red" : "orange"}`}>{item.status}</span></td>
              </tr>
            ))}
            {data.receivables.length === 0 && <tr><td colSpan={5}>Nenhum recebível cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Ações rápidas" />
      <div className="quick">
        <Link href="/cadastros">Novo lançamento / conta / veículo</Link>
        <Link href="/assistente">Consultar com IA</Link>
        <Link href="/documentos">Enviar nota, XML ou comprovante</Link>
        <Link href="/integracoes">Integrações</Link>
      </div>
    </>
  );
}
