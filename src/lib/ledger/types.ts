export const WORKSPACES = ["Prime", "Pessoal", "Juros"] as const;

export type Workspace = (typeof WORKSPACES)[number];

export type EntryKind = "receita" | "despesa" | "transferencia" | "pagamento_cartao";

export type Recurrence = "unica" | "mensal";

export type AccountKind = "banco" | "carteira" | "cartao";

export type Vehicle = {
  id: string;
  name: string;
  plate: string;
  model: string;
  year: string;
  km: number | null;
  kmPerLiter: number | null;
};

export type Account = {
  id: string;
  name: string;
  workspace: Workspace;
  kind: AccountKind;
  balanceCents: number;
};

export type Entry = {
  id: string;
  kind: EntryKind;
  workspace: Workspace;
  description: string;
  amountCents: number;
  date: string;
  category: string;
  recurrence: Recurrence;
  dueDay: number | null;
  vehicleId: string | null;
  accountId: string | null;
  counterAccountId: string | null;
};

export type LedgerState = {
  vehicles: Vehicle[];
  accounts: Account[];
  entries: Entry[];
};

export const WORKSPACE_LABEL: Record<Workspace, string> = {
  Prime: "Prime Group",
  Pessoal: "Pessoal",
  Juros: "Recebíveis / Juros",
};

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  banco: "Banco",
  carteira: "Carteira",
  cartao: "Cartão",
};

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  receita: "Receita",
  despesa: "Despesa",
  transferencia: "Transferência",
  pagamento_cartao: "Pagamento de fatura",
};

export const CATEGORIES: Record<Workspace, { despesa: string[]; receita: string[] }> = {
  Prime: {
    despesa: ["Combustível", "Manutenção", "Pedágio", "Pneu", "Motorista", "Imposto", "Financeiro", "Outros"],
    receita: ["Frete", "Reembolso", "Outros"],
  },
  Pessoal: {
    despesa: ["Moradia", "Saúde", "Alimentação", "Transporte", "Lazer", "Educação", "Outros"],
    receita: ["Salário", "Renda extra", "Outros"],
  },
  Juros: {
    despesa: ["Custo do acordo", "Outros"],
    receita: ["Juros", "Outros"],
  },
};
