import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, shortDate } from "@/lib/finance/format";

export default async function Page() {
  const data = await getFinanceSnapshot();
  const completed = data.trips.filter((item) => item.status === "completed");
  const knownRevenue = completed.filter((item) => item.freight_revenue !== null);
  const revenue = knownRevenue.reduce((sum, item) => sum + Number(item.freight_revenue), 0);
  const knownDistances = completed.filter((item) => item.distance_km !== null);
  const km = knownDistances.reduce((sum, item) => sum + Number(item.distance_km), 0);

  return (
    <>
      <Header title="Viagens e CT-e" subtitle="Fretes cadastrados com os dados conhecidos, sem exigir quilometragem ou horários." />
      <div className="quick">
        <Link href="/assistente">Cadastrar frete conversando com a IA</Link>
        <Link href="/registros">Ver anotações incompletas</Link>
      </div>
      <div className="grid grid-4">
        <Metric label="Viagens concluídas" value={String(completed.length)} />
        <Metric label="Valor dos fretes conhecidos" value={brl(revenue)} foot="Apenas fretes concluídos com valor informado; não significa receita recebida." />
        <Metric label="KM conhecidos" value={knownDistances.length ? km.toLocaleString("pt-BR") : "Não informados"} foot="Viagens sem km ficam fora desta soma." />
        <Metric label="Ticket médio informado" value={knownRevenue.length ? brl(revenue / knownRevenue.length) : "Não informado"} />
      </div>
      <SectionTitle title="Fretes cadastrados" />
      <div className="notice">Preço do frete e valor combinado com motorista não significam que foram recebidos ou pagos. O saldo indicado não inclui combustível, manutenção ou outros custos e não representa lucro contabilizado.</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>Rota</th>
              <th>Motorista</th>
              <th>KM</th>
              <th>Preço frete</th>
              <th>Valor motorista</th>
              <th>Saldo previsto*</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.trips.map((item) => (
              <tr key={item.id}>
                <td>{item.service_date || item.started_at ? shortDate(item.service_date ?? item.started_at) : "Não informado"}</td>
                <td>{item.customer_name ?? "Não informado"}</td>
                <td>
                  <div>{item.origin ?? "Origem não informada"} → {item.destination ?? "Destino não informado"}</div>
                  {item.reference && <div className="metric-foot">{item.reference}</div>}
                  {item.notes && <div className="metric-foot">{item.notes}</div>}
                </td>
                <td>{item.driver_name ?? "Não informado"}</td>
                <td>{item.distance_km !== null ? Number(item.distance_km).toLocaleString("pt-BR") : "—"}</td>
                <td>{item.freight_revenue !== null ? brl(item.freight_revenue) : "Não informado"}</td>
                <td>{item.driver_cost !== null ? brl(item.driver_cost) : "Não informado"}</td>
                <td>{item.freight_revenue !== null && item.driver_cost !== null ? brl(item.freight_revenue - item.driver_cost) : "—"}</td>
                <td>{item.status === "planned" ? "Cadastrado" : item.status}</td>
              </tr>
            ))}
            {data.trips.length === 0 && (
              <tr><td colSpan={9}>Nenhum frete cadastrado ainda. Informe apenas o que souber à IA.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="metric-foot" style={{ marginTop: 8 }}>* Saldo previsto antes das demais despesas, sem baixa financeira.</div>
    </>
  );
}
