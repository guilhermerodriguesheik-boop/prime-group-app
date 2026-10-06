import { fleet, receivables } from "@/data/demo";
import { Header, Metric, Money, SectionTitle } from "@/components/ui";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <Header title="Visão geral" subtitle="Prime + pessoal + recebíveis, sem misturar as contabilidades." />
      <div className="grid grid-4">
        <Metric label="Caixa consolidado" value="R$ 87.420" foot="saldos disponíveis" />
        <Metric label="A receber · 30 dias" value="R$ 61.200" foot="fretes + acordos" tone="positive" />
        <Metric label="A pagar · 30 dias" value="R$ 32.400" foot="contas + faturas" tone="warning" />
        <Metric label="Patrimônio estimado" value="R$ 819.000" foot="ativos menos obrigações" />
      </div>

      <SectionTitle title="Separação financeira" hint="consolidado apenas para análise" />
      <div className="grid grid-3">
        <div className="card"><h3>Prime Group</h3><div className="metric-value">R$ 585.000</div><div className="mini-grid"><div className="mini">Caixa<b>R$ 65.000</b></div><div className="mini">Recebíveis<b>R$ 130.000</b></div></div></div>
        <div className="card"><h3>Pessoal</h3><div className="metric-value">R$ 140.000</div><div className="mini-grid"><div className="mini">Disponível<b>R$ 20.000</b></div><div className="mini">Obrigações<b>R$ 30.000</b></div></div></div>
        <div className="card"><h3>Recebíveis / Juros</h3><div className="metric-value">R$ 94.000</div><div className="mini-grid"><div className="mini">Capital<b>R$ 80.000</b></div><div className="mini">Juros previstos<b>R$ 14.000</b></div></div></div>
      </div>

      <SectionTitle title="Frota · resultado do mês" hint="receita menos custos diretos" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Veículo</th><th>Receita</th><th>Custo</th><th>Lucro</th><th>Margem</th><th>KM/L</th></tr></thead>
          <tbody>
            {fleet.map((v) => (
              <tr key={v.vehicle}>
                <td><b>{v.vehicle}</b></td>
                <td><Money value={v.revenue} /></td>
                <td><Money value={v.cost} /></td>
                <td className="positive"><Money value={v.profit} /></td>
                <td>{Math.round((v.profit / v.revenue) * 100)}%</td>
                <td>{v.kmL.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Próximos recebimentos" hint="conciliação automática quando cair no banco" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Origem</th><th>Ambiente</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead>
          <tbody>
            {receivables.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td><td>{r.workspace}</td><td>{r.due}</td><td><Money value={r.amount} /></td>
                <td><span className="badge orange">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle title="Ações rápidas" />
      <div className="quick">
        <Link href="/assistente">Registrar por texto/IA</Link>
        <Link href="/documentos">Enviar nota, XML ou comprovante</Link>
        <Link href="/integracoes">Conectar bancos, WhatsApp e Cargozilla</Link>
      </div>
    </>
  );
}
