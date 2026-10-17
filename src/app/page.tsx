import Link from "next/link";
import { ArrowUpRight, FileCheck2, Landmark, ClipboardList } from "lucide-react";
import { Header, Metric, SectionTitle } from "@/components/ui";
import { CommandCenter } from "@/components/assistant/command-center";
import { HomeTabs,HomeTabPanel } from "@/components/home/home-tabs";
import { getFinanceSnapshot } from "@/lib/finance/data";
import { brl, pct, shortDate, workspaceLabel } from "@/lib/finance/format";

export default async function Home() {
  const data = await getFinanceSnapshot();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const weekEnd = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const remindersDue = data.paymentReminders.filter((item) => item.status === "pending" && item.remind_on <= today);
  const payablesSoon = data.payables.filter((item) =>
    ["open", "partial", "overdue"].includes(item.status) && item.due_date <= weekEnd
  );
  const interestToCollect = data.interestOnlyStatus.filter((item) =>
    Number(item.accrued_interest_due) > 0 ||
    (item.next_interest_due_date !== null && item.next_interest_due_date <= weekEnd)
  );

  return (
    <>
      <Header title="Visão geral" subtitle="Prime + pessoal + recebíveis, sem misturar as contabilidades." />
      <HomeTabs>
        <HomeTabPanel tab="resumo">
      <section className="home-workflow-strip">
        <div className="home-workflow-copy">
          <div className="home-workflow-overline"><span/> PRIME OPERATIONS / WORKSPACE PRIVADO</div>
          <h2>Controle financeiro e logística, conectados.</h2>
          <p>Priorize sua operação. Os módulos da transportadora e os dados pessoais continuam separados no banco.</p>
        </div>
        <nav className="home-workflow-actions" aria-label="Atalhos principais">
          <Link href="/fiscal"><FileCheck2 size={19}/><span><strong>Transporte</strong><small>Cargas, acertos e despesas</small></span><ArrowUpRight size={16}/></Link>
          <Link href="/financeiro"><ClipboardList size={19}/><span><strong>Financeiro</strong><small>Pagamentos pendentes e recorrentes</small></span><ArrowUpRight size={16}/></Link>
          <Link href="/bancos"><Landmark size={19}/><span><strong>Bancos</strong><small>Open Finance e movimentações</small></span><ArrowUpRight size={16}/></Link>
        </nav>
      </section>
      <div className="grid grid-4">
        <Metric label="Caixa consolidado" value={brl(data.cash)} foot="saldo inicial + movimentos realizados" />
        <Metric label="A receber · 30 dias" value={brl(data.receivable30)} foot="recebíveis em aberto" tone="positive" />
        <Metric label="A pagar · 30 dias" value={brl(data.payable30)} foot="obrigações em aberto" tone={data.payable30 > 0 ? "warning" : undefined} />
        <Metric label="Resultado do mês" value={brl(data.prime.result + data.personal.result + data.interest.result)} foot="receitas menos despesas realizadas" tone={(data.prime.result + data.personal.result + data.interest.result) >= 0 ? "positive" : "warning"} />
      </div>

        </HomeTabPanel>
        <HomeTabPanel tab="assistente">
      <div className="home-intelligence-heading"><div><span>INTELIGÊNCIA DA PRIME</span><h2>Seu assistente financeiro</h2><p>Converse sobre fretes, despesas, comprovantes e decisões do dia a dia.</p></div><Link href="/assistente">Abrir assistente completo <ArrowUpRight size={15}/></Link></div>
      <CommandCenter workspaces={data.workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, kind: workspace.kind }))} />

        </HomeTabPanel>
        <HomeTabPanel tab="resumo">
      {(data.overdueReceivables > 0 || data.overduePayables > 0) && (
        <div className="notice attention">
          <b>Atenção:</b> {data.overdueReceivables > 0 ? `${brl(data.overdueReceivables)} a receber em atraso. ` : ""}
          {data.overduePayables > 0 ? `${brl(data.overduePayables)} a pagar em atraso.` : ""}
        </div>
      )}

      {(remindersDue.length > 0 || payablesSoon.length > 0) && (
        <div className="notice attention">
          <b>Vencimentos:</b> {remindersDue.length} lembrete(s) para verificar e {payablesSoon.length} conta(s) vencendo ou atrasadas nos próximos 7 dias.{" "}
          <Link href="/planejamento">Ver avisos e vencimentos</Link>
        </div>
      )}

      {interestToCollect.length > 0 && (
        <div className="notice attention">
          <b>Cobranças de juros:</b> {interestToCollect.length} empréstimo(s) com juros vencidos ou vencendo nos próximos 7 dias.{" "}
          <Link href="/juros">Ver juros e saldo de quitação</Link>
        </div>
      )}

        </HomeTabPanel>
        <HomeTabPanel tab="financas">
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

        </HomeTabPanel>
        <HomeTabPanel tab="frota">
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

        </HomeTabPanel>
        <HomeTabPanel tab="receber">
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

        </HomeTabPanel>
        <HomeTabPanel tab="acoes">
      <SectionTitle title="Ações rápidas" />
      <div className="quick">
        <Link href="/prime">Novo lançamento da Prime</Link><Link href="/pessoal">Novo lançamento pessoal</Link><Link href="/frota">Cadastrar veículo</Link>
        <Link href="/registros">Registros parciais salvos pela IA</Link>
        <Link href="/assistente">Consultar com IA</Link>
        <Link href="/documentos">Enviar nota, XML ou comprovante</Link>
        <Link href="/integracoes">Integrações</Link>
      </div>
        </HomeTabPanel>
      </HomeTabs>
    </>
  );
}
