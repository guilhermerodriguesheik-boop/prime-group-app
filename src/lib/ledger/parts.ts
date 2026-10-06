export const PARTS = [
  { id: "veiculos", label: "Veículos" },
  { id: "despesas", label: "Despesas" },
  { id: "receitas", label: "Receitas" },
  { id: "contas", label: "Contas" },
] as const;

export type Part = (typeof PARTS)[number]["id"];

export function parsePart(value: string | null | undefined): Part {
  return PARTS.some((part) => part.id === value) ? (value as Part) : "veiculos";
}
