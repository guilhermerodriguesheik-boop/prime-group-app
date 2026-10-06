"use client";

import Link from "next/link";
import { Metric, SectionTitle } from "@/components/ui";
import { formatCents, formatDate } from "@/lib/ledger/money";
import { marginLabel, sumCents, vehicleName, vehicleResult, workspaceTotals } from "@/lib/ledger/selectors";
import { ACCOUNT_KIND_LABEL, WORKSPACE_LABEL, type Workspace } from "@/lib/ledger/types";
import { useLedger } from "./use-ledger";

export function WorkspaceBoard({ workspace }: { workspace: Extract<Workspace, "Prime" | "Pessoal"> }) {
  const ledger = useLedger();
  const totals = workspaceTotals(ledger.entries, workspace);
  const recurring = sumCents(ledger.entries, (entry) => entry.workspace === workspace && entry.kind === "despesa" && entry.recurrence === "mensal");
  const entries = ledger.entries.filter((entry) => entry.workspace === workspace && (entry.kind === "receita" || entry.kind === "despesa"));

  return (
    <>
      <div className="grid grid-4">
        <Metric label="Receitas" value={formatCents(totals.revenue)} tone="positive" />
        <Metric label={workspace === "Pessoal" ? "Despesas" : "Custos operacionais"} value={formatCents(totals.expense)} />
        <Metric label="Resultado" value={formatCents(totals.result)} tone={totals.result >= 0 ? "positive" : "warning"} />
        <Metric label={workspace === "Pessoal" ? "Recorrentes" : "Margem"} value={workspace === "Pessoal" ? formatCents(recurring) : marginLabel(totals.result, totals.revenue)} />
      </div>

      {workspace === "Prime" && (
        <>
          <SectionTitle title="Resultado por veículo" hint="receita menos despesa do veículo" />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Veículo</th><th>Receita</th><th>Custo</th><th>Lucro</th></tr></thead>
              <tbody>
                {ledger.vehicles.map((vehicle) => {
                  const result = vehicleResult(ledger.entries, vehicle.id);
                  return (
                    <tr key={vehicle.id}>
                      <td>{vehicle.name}</td>
                      <td>{formatCents(result.revenue)}</td>
                      <td>{formatCents(result.cost)}</td>
                      <td className={result.profit >= 0 ? "positive" : "warning"}>{formatCents(result.profit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SectionTitle title={workspace === "Pessoal" ? "Despesas e receitas" : "Lançamentos da Prime"} hint={WORKSPACE_LABEL[workspace]} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Categoria</th>
              {workspace === "Prime" && <th>Veículo</th>}
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDate(entry.date)}{entry.recurrence === "mensal" ? ` · dia ${entry.dueDay}` : ""}</td>
                <td>{entry.description}</td>
                <td>{entry.category}</td>
                {workspace === "Prime" && <td>{vehicleName(ledger.vehicles, entry.vehicleId)}</td>}
                <td className={entry.kind === "receita" ? "positive" : undefined}>{entry.kind === "despesa" ? "− " : ""}{formatCents(entry.amountCents)}</td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={workspace === "Prime" ? 5 : 4}>Nenhum lançamento. <Link href={workspace === "Pessoal" ? "/cadastros?parte=despesas" : "/cadastros?parte=receitas"}>Cadastrar</Link></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AccountsBoard() {
  const { accounts } = useLedger();
  const banks = sumCentsBalance(accounts, (account) => account.kind !== "cartao");
  const cards = sumCentsBalance(accounts, (account) => account.kind === "cartao");

  return (
    <>
      <div className="grid grid-4">
        <Metric label="Saldo em bancos e carteiras" value={formatCents(banks)} />
        <Metric label="Faturas em aberto" value={formatCents(cards)} tone="warning" />
        <Metric label="Contas cadastradas" value={String(accounts.length)} />
        <Metric label="Ambientes" value="3" foot="Prime, Pessoal e Juros" />
      </div>
      <SectionTitle title="Contas cadastradas" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Conta</th><th>Ambiente</th><th>Tipo</th><th>Saldo</th></tr></thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>{WORKSPACE_LABEL[account.workspace]}</td>
                <td>{ACCOUNT_KIND_LABEL[account.kind]}</td>
                <td>{formatCents(account.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SectionTitle title="Conciliação" />
      <div className="notice">Pagamento de fatura e transferência entre contas ficam fora da receita e da despesa. A conciliação com o banco entra quando o Open Finance estiver conectado.</div>
    </>
  );
}

function sumCentsBalance(accounts: { balanceCents: number; kind: string }[], predicate: (account: { balanceCents: number; kind: string }) => boolean) {
  return accounts.reduce((total, account) => (predicate(account) ? total + account.balanceCents : total), 0);
}
