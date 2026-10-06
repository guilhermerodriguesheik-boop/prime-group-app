"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header, SectionTitle } from "@/components/ui";
import { formatCents, formatDate, parseMoneyToCents } from "@/lib/ledger/money";
import { vehicleName } from "@/lib/ledger/selectors";
import {
  ACCOUNT_KIND_LABEL,
  CATEGORIES,
  ENTRY_KIND_LABEL,
  WORKSPACE_LABEL,
  WORKSPACES,
  type AccountKind,
  type Entry,
  type EntryKind,
  type Recurrence,
  type Workspace,
} from "@/lib/ledger/types";
import { useLedger } from "./use-ledger";

const PARTS = [
  { id: "veiculos", label: "Veículos" },
  { id: "despesas", label: "Despesas" },
  { id: "receitas", label: "Receitas" },
  { id: "contas", label: "Contas" },
] as const;

type Part = (typeof PARTS)[number]["id"];

function parsePart(value: string | null): Part {
  return PARTS.some((part) => part.id === value) ? (value as Part) : "veiculos";
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function newId() {
  return crypto.randomUUID();
}

export function Cadastros() {
  const router = useRouter();
  const params = useSearchParams();
  const part = parsePart(params.get("parte"));
  const ledger = useLedger();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectPart(next: Part) {
    setMessage(null);
    setError(null);
    router.replace(`/cadastros?parte=${next}`, { scroll: false });
  }

  function notify(text: string) {
    setError(null);
    setMessage(text);
  }

  function fail(text: string) {
    setMessage(null);
    setError(text);
  }

  return (
    <>
      <Header title="Cadastros" subtitle="Veículos, despesas, receitas e contas, cada um no seu ambiente." />
      <div className="tabs" role="tablist">
        {PARTS.map((item) => (
          <button key={item.id} className={part === item.id ? "tab active" : "tab"} type="button" onClick={() => selectPart(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {message && <p className="form-ok">{message}</p>}
      {error && <p className="form-error">{error}</p>}
      {part === "veiculos" && <VehiclePart ledger={ledger} onSuccess={notify} onError={fail} />}
      {part === "despesas" && <EntryPart kind="despesa" ledger={ledger} onSuccess={notify} onError={fail} />}
      {part === "receitas" && <EntryPart kind="receita" ledger={ledger} onSuccess={notify} onError={fail} />}
      {part === "contas" && <AccountPart ledger={ledger} onSuccess={notify} onError={fail} />}
    </>
  );
}

type LedgerApi = ReturnType<typeof useLedger>;

function VehiclePart({ ledger, onSuccess, onError }: { ledger: LedgerApi; onSuccess: (text: string) => void; onError: (text: string) => void }) {
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [km, setKm] = useState("");
  const [kmPerLiter, setKmPerLiter] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      onError("Informe o apelido do veículo.");
      return;
    }
    const normalizedPlate = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (normalizedPlate && (normalizedPlate.length < 7 || normalizedPlate.length > 8)) {
      onError("A placa precisa ter 7 ou 8 caracteres.");
      return;
    }
    if (normalizedPlate && ledger.vehicles.some((vehicle) => vehicle.plate === normalizedPlate)) {
      onError("Já existe um veículo com essa placa.");
      return;
    }
    if (year && !/^(19|20)\d{2}$/.test(year)) {
      onError("Informe o ano com 4 dígitos.");
      return;
    }
    const parsedKm = parseOptionalNumber(km);
    if (km && (parsedKm === null || parsedKm < 0 || !Number.isInteger(parsedKm))) {
      onError("Informe a quilometragem como número inteiro.");
      return;
    }
    const parsedConsumption = parseOptionalDecimal(kmPerLiter);
    if (kmPerLiter && (parsedConsumption === null || parsedConsumption <= 0)) {
      onError("Informe o consumo em km/l, como 2,9.");
      return;
    }

    ledger.addVehicle({
      id: newId(),
      name: trimmedName,
      plate: normalizedPlate,
      model: model.trim(),
      year: year.trim(),
      km: parsedKm,
      kmPerLiter: parsedConsumption,
    });
    setName("");
    setPlate("");
    setModel("");
    setYear("");
    setKm("");
    setKmPerLiter("");
    onSuccess("Veículo cadastrado.");
  }

  return (
    <div className="cadastro-layout">
      <form className="card form-card" onSubmit={onSubmit}>
        <SectionTitle title="Novo veículo" hint="Frota da Prime" />
        <div className="form-grid">
          <Field label="Apelido" value={name} onChange={setName} placeholder="VW 12.170" required />
          <Field label="Placa" value={plate} onChange={setPlate} placeholder="ABC1D23" />
          <Field label="Modelo" value={model} onChange={setModel} placeholder="VW Delivery" />
          <Field label="Ano" value={year} onChange={setYear} placeholder="2018" inputMode="numeric" />
          <Field label="KM atual" value={km} onChange={setKm} placeholder="4210" inputMode="numeric" />
          <Field label="Consumo km/l" value={kmPerLiter} onChange={setKmPerLiter} placeholder="2,9" inputMode="decimal" />
        </div>
        <button className="btn" type="submit">Cadastrar veículo</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Veículo</th><th>Placa</th><th>Ano</th><th>KM</th><th>KM/L</th><th></th></tr>
          </thead>
          <tbody>
            {ledger.vehicles.map((vehicle) => (
              <tr key={vehicle.id}>
                <td><b>{vehicle.name}</b><div className="metric-foot">{vehicle.model || "Sem modelo"}</div></td>
                <td>{vehicle.plate || "—"}</td>
                <td>{vehicle.year || "—"}</td>
                <td>{vehicle.km?.toLocaleString("pt-BR") ?? "—"}</td>
                <td>{vehicle.kmPerLiter ? vehicle.kmPerLiter.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"}</td>
                <td><button className="btn danger" type="button" onClick={() => {
                  const result = ledger.removeVehicle(vehicle.id);
                  if (result) onError(result);
                  else onSuccess("Veículo removido.");
                }}>Remover</button></td>
              </tr>
            ))}
            {ledger.vehicles.length === 0 && <tr><td colSpan={6}>Nenhum veículo cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EntryPart({ kind, ledger, onSuccess, onError }: { kind: "despesa" | "receita"; ledger: LedgerApi; onSuccess: (text: string) => void; onError: (text: string) => void }) {
  const [workspace, setWorkspace] = useState<Workspace>("Prime");
  const [movement, setMovement] = useState<EntryKind>(kind);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO);
  const [category, setCategory] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("unica");
  const [dueDay, setDueDay] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [counterAccountId, setCounterAccountId] = useState("");

  const categories = kind === "despesa" ? CATEGORIES[workspace].despesa : CATEGORIES[workspace].receita;
  const accounts = ledger.accounts.filter((account) => account.workspace === workspace);
  const bankAccounts = accounts.filter((account) => account.kind !== "cartao");
  const cards = accounts.filter((account) => account.kind === "cartao");
  const visibleEntries = useMemo(
    () => ledger.entries.filter((entry) => (kind === "despesa" ? entry.kind !== "receita" : entry.kind === "receita")),
    [kind, ledger.entries],
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = description.trim();
    if (trimmed.length < 2) {
      onError("Informe uma descrição.");
      return;
    }
    const amountCents = parseMoneyToCents(amount);
    if (amountCents === null) {
      onError("Informe um valor válido, como 1.250,00.");
      return;
    }
    if (!date) {
      onError("Informe a data.");
      return;
    }
    const effectiveKind: EntryKind = kind === "receita" ? "receita" : movement;
    if (effectiveKind !== "transferencia" && effectiveKind !== "pagamento_cartao" && !category) {
      onError("Escolha uma categoria.");
      return;
    }
    let parsedDue: number | null = null;
    if (recurrence === "mensal" && effectiveKind !== "transferencia" && effectiveKind !== "pagamento_cartao") {
      parsedDue = Number(dueDay);
      if (!Number.isInteger(parsedDue) || parsedDue < 1 || parsedDue > 28) {
        onError("O dia do vencimento fica entre 1 e 28.");
        return;
      }
    }
    if (effectiveKind === "transferencia") {
      if (!accountId || !counterAccountId) {
        onError("Escolha a conta de origem e a conta de destino.");
        return;
      }
      if (accountId === counterAccountId) {
        onError("Origem e destino precisam ser contas diferentes.");
        return;
      }
    }
    if (effectiveKind === "pagamento_cartao") {
      if (!accountId || !counterAccountId) {
        onError("Escolha o cartão e a conta que pagou a fatura.");
        return;
      }
    }

    const entry: Entry = {
      id: newId(),
      kind: effectiveKind,
      workspace,
      description: trimmed,
      amountCents,
      date,
      category: effectiveKind === "transferencia" ? "Transferência" : effectiveKind === "pagamento_cartao" ? "Pagamento de fatura" : category,
      recurrence: effectiveKind === "receita" || effectiveKind === "despesa" ? recurrence : "unica",
      dueDay: parsedDue,
      vehicleId: workspace === "Prime" && vehicleId ? vehicleId : null,
      accountId: accountId || null,
      counterAccountId: effectiveKind === "transferencia" || effectiveKind === "pagamento_cartao" ? counterAccountId || null : null,
    };
    ledger.addEntry(entry);
    setDescription("");
    setAmount("");
    setCategory("");
    setVehicleId("");
    setAccountId("");
    setCounterAccountId("");
    setRecurrence("unica");
    setDueDay("");
    onSuccess(effectiveKind === "receita" ? "Receita cadastrada." : effectiveKind === "despesa" ? "Despesa cadastrada." : "Movimento cadastrado, fora do resultado.");
  }

  return (
    <div className="cadastro-layout">
      <form className="card form-card" onSubmit={onSubmit}>
        <SectionTitle title={kind === "despesa" ? "Nova despesa" : "Nova receita"} />
        <div className="form-grid">
          <label className="field">
            <span>Ambiente</span>
            <select value={workspace} onChange={(event) => { setWorkspace(event.target.value as Workspace); setCategory(""); setVehicleId(""); setAccountId(""); setCounterAccountId(""); }}>
              {WORKSPACES.map((item) => <option key={item} value={item}>{WORKSPACE_LABEL[item]}</option>)}
            </select>
          </label>
          {kind === "despesa" && (
            <label className="field">
              <span>Tipo</span>
              <select value={movement} onChange={(event) => setMovement(event.target.value as EntryKind)}>
                <option value="despesa">Despesa</option>
                <option value="pagamento_cartao">Pagamento de fatura</option>
                <option value="transferencia">Transferência entre contas</option>
              </select>
            </label>
          )}
          <Field label="Descrição" value={description} onChange={setDescription} placeholder={kind === "receita" ? "Frete do cliente" : "Combustível"} required />
          <Field label="Valor" value={amount} onChange={setAmount} placeholder="1.250,00" inputMode="decimal" required />
          <Field label="Data" value={date} onChange={setDate} type="date" required />
          {movement !== "transferencia" && movement !== "pagamento_cartao" && (
            <label className="field">
              <span>Categoria</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} required>
                <option value="">Selecione</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          )}
          {workspace === "Prime" && movement !== "transferencia" && movement !== "pagamento_cartao" && (
            <label className="field">
              <span>Veículo</span>
              <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
                <option value="">Sem veículo</option>
                {ledger.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
              </select>
            </label>
          )}
          {movement === "pagamento_cartao" ? (
            <>
              <AccountSelect label="Cartão" accounts={cards} value={counterAccountId} onChange={setCounterAccountId} />
              <AccountSelect label="Conta que pagou" accounts={bankAccounts} value={accountId} onChange={setAccountId} />
            </>
          ) : movement === "transferencia" ? (
            <>
              <AccountSelect label="Conta de origem" accounts={accounts} value={accountId} onChange={setAccountId} />
              <AccountSelect label="Conta de destino" accounts={accounts} value={counterAccountId} onChange={setCounterAccountId} />
            </>
          ) : (
            <AccountSelect label="Conta" accounts={accounts} value={accountId} onChange={setAccountId} optional />
          )}
          {(movement === "despesa" || movement === "receita") && (
            <label className="field">
              <span>Repetição</span>
              <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Recurrence)}>
                <option value="unica">Lançamento único</option>
                <option value="mensal">Todo mês</option>
              </select>
            </label>
          )}
          {recurrence === "mensal" && (movement === "despesa" || movement === "receita") && (
            <Field label="Dia do vencimento" value={dueDay} onChange={setDueDay} placeholder="10" inputMode="numeric" />
          )}
        </div>
        {kind === "despesa" && <p className="hint">Pagamento de fatura e transferência entre contas ficam registrados e fora do resultado.</p>}
        <button className="btn" type="submit">
          {movement === "pagamento_cartao" ? "Registrar pagamento" : movement === "transferencia" ? "Registrar transferência" : kind === "despesa" ? "Cadastrar despesa" : "Cadastrar receita"}
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Data</th><th>Descrição</th><th>Ambiente</th><th>Categoria</th><th>Veículo</th><th>Valor</th><th></th></tr>
          </thead>
          <tbody>
            {visibleEntries.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDate(entry.date)}</td>
                <td>
                  <b>{entry.description}</b>
                  {entry.kind !== "receita" && entry.kind !== "despesa" && <div className="metric-foot">{ENTRY_KIND_LABEL[entry.kind]} · fora do resultado</div>}
                  {entry.recurrence === "mensal" && <div className="metric-foot">Todo mês · dia {entry.dueDay}</div>}
                </td>
                <td>{WORKSPACE_LABEL[entry.workspace]}</td>
                <td>{entry.category}</td>
                <td>{vehicleName(ledger.vehicles, entry.vehicleId)}</td>
                <td className={entry.kind === "receita" ? "positive" : undefined}>{formatCents(entry.amountCents)}</td>
                <td><button className="btn danger" type="button" onClick={() => { ledger.removeEntry(entry.id); onSuccess("Lançamento removido."); }}>Remover</button></td>
              </tr>
            ))}
            {visibleEntries.length === 0 && <tr><td colSpan={7}>Nenhum lançamento cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountPart({ ledger, onSuccess, onError }: { ledger: LedgerApi; onSuccess: (text: string) => void; onError: (text: string) => void }) {
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState<Workspace>("Prime");
  const [kind, setKind] = useState<AccountKind>("banco");
  const [balance, setBalance] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      onError("Informe o nome da conta.");
      return;
    }
    const balanceCents = parseMoneyToCents(balance);
    if (balanceCents === null) {
      onError("Informe o saldo, como 1.250,00.");
      return;
    }
    ledger.addAccount({ id: newId(), name: trimmed, workspace, kind, balanceCents });
    setName("");
    setBalance("");
    onSuccess("Conta cadastrada.");
  }

  return (
    <div className="cadastro-layout">
      <form className="card form-card" onSubmit={onSubmit}>
        <SectionTitle title="Nova conta" hint="Saldo informado" />
        <div className="form-grid">
          <Field label="Nome" value={name} onChange={setName} placeholder="Itaú Prime" required />
          <label className="field">
            <span>Ambiente</span>
            <select value={workspace} onChange={(event) => setWorkspace(event.target.value as Workspace)}>
              {WORKSPACES.map((item) => <option key={item} value={item}>{WORKSPACE_LABEL[item]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Tipo</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as AccountKind)}>
              <option value="banco">Banco</option>
              <option value="carteira">Carteira</option>
              <option value="cartao">Cartão</option>
            </select>
          </label>
          <Field label={kind === "cartao" ? "Fatura em aberto" : "Saldo"} value={balance} onChange={setBalance} placeholder="10.000,00" inputMode="decimal" required />
        </div>
        <button className="btn" type="submit">Cadastrar conta</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Conta</th><th>Ambiente</th><th>Tipo</th><th>Saldo</th><th></th></tr>
          </thead>
          <tbody>
            {ledger.accounts.map((account) => (
              <tr key={account.id}>
                <td><b>{account.name}</b></td>
                <td>{WORKSPACE_LABEL[account.workspace]}</td>
                <td>{ACCOUNT_KIND_LABEL[account.kind]}</td>
                <td>{formatCents(account.balanceCents)}</td>
                <td><button className="btn danger" type="button" onClick={() => {
                  const result = ledger.removeAccount(account.id);
                  if (result) onError(result);
                  else onSuccess("Conta removida.");
                }}>Remover</button></td>
              </tr>
            ))}
            {ledger.accounts.length === 0 && <tr><td colSpan={5}>Nenhuma conta cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountSelect({ label, accounts, value, onChange, optional = false }: { label: string; accounts: { id: string; name: string }[]; value: string; onChange: (value: string) => void; optional?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required={!optional}>
        <option value="">{optional ? "Sem conta" : accounts.length ? "Selecione" : "Nenhuma conta neste ambiente"}</option>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>
    </label>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", inputMode, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; inputMode?: "text" | "numeric" | "decimal"; required?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} type={type} inputMode={inputMode} placeholder={placeholder} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function parseOptionalDecimal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}
