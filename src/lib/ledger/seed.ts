import type { LedgerState } from "./types";

export function createSeed(): LedgerState {
  return {
    vehicles: [
      { id: "v-12170", name: "VW 12.170", plate: "ABC1D23", model: "VW Delivery 12.170", year: "2018", km: 4210, kmPerLiter: 2.9 },
      { id: "v-sprinter19", name: "Sprinter 2019", plate: "EFG4H56", model: "Mercedes Sprinter", year: "2019", km: 3380, kmPerLiter: 8.6 },
      { id: "v-sprinter07", name: "Sprinter 2007", plate: "IJK7L89", model: "Mercedes Sprinter", year: "2007", km: 2940, kmPerLiter: 7.5 },
    ],
    accounts: [
      { id: "acc-itau", name: "Itaú Prime", workspace: "Prime", kind: "banco", balanceCents: 6742000 },
      { id: "acc-nubank", name: "Nubank Pessoal", workspace: "Pessoal", kind: "banco", balanceCents: 2000000 },
      { id: "acc-cartao", name: "Cartão Nubank", workspace: "Pessoal", kind: "cartao", balanceCents: 1243000 },
    ],
    entries: [
      entry("e-r-12170", "receita", "Prime", "Fretes do período", 2800000, "2026-10-01", "Frete", "v-12170", "acc-itau"),
      entry("e-d-12170", "despesa", "Prime", "Custos do período", 1400000, "2026-10-01", "Combustível", "v-12170", "acc-itau"),
      entry("e-r-s19", "receita", "Prime", "Fretes do período", 1800000, "2026-10-01", "Frete", "v-sprinter19", "acc-itau"),
      entry("e-d-s19", "despesa", "Prime", "Custos do período", 850000, "2026-10-01", "Combustível", "v-sprinter19", "acc-itau"),
      entry("e-r-s07", "receita", "Prime", "Fretes do período", 1270000, "2026-10-01", "Frete", "v-sprinter07", "acc-itau"),
      entry("e-d-s07", "despesa", "Prime", "Custos do período", 870000, "2026-10-01", "Manutenção", "v-sprinter07", "acc-itau"),
      entry("e-aluguel", "despesa", "Pessoal", "Aluguel", 130000, "2026-10-10", "Moradia", null, "acc-nubank", "mensal", 10),
      entry("e-saude", "despesa", "Pessoal", "Plano de saúde", 70000, "2026-10-05", "Saúde", null, "acc-nubank", "mensal", 5),
      entry("e-academia", "despesa", "Pessoal", "Academia + personal", 50000, "2026-10-05", "Saúde", null, "acc-nubank", "mensal", 5),
      entry("e-consorcio", "despesa", "Pessoal", "Consórcio", 73100, "2026-10-15", "Outros", null, "acc-nubank", "mensal", 15),
      entry("e-pronampe", "despesa", "Prime", "Pronampe", 30000, "2026-10-20", "Financeiro", null, "acc-itau", "mensal", 20),
    ],
  };
}

function entry(
  id: string,
  kind: "receita" | "despesa",
  workspace: "Prime" | "Pessoal" | "Juros",
  description: string,
  amountCents: number,
  date: string,
  category: string,
  vehicleId: string | null,
  accountId: string | null,
  recurrence: "unica" | "mensal" = "unica",
  dueDay: number | null = null,
) {
  return {
    id,
    kind,
    workspace,
    description,
    amountCents,
    date,
    category,
    recurrence,
    dueDay,
    vehicleId,
    accountId,
    counterAccountId: null,
  } as const;
}
