import type { Entry, Vehicle, Workspace } from "./types";

export function sumCents(entries: Entry[], predicate: (entry: Entry) => boolean) {
  return entries.reduce((total, entry) => (predicate(entry) ? total + entry.amountCents : total), 0);
}

export function countsAsResult(entry: Entry) {
  return entry.kind === "receita" || entry.kind === "despesa";
}

export function vehicleResult(entries: Entry[], vehicleId: string) {
  const revenue = sumCents(entries, (entry) => entry.vehicleId === vehicleId && entry.kind === "receita");
  const cost = sumCents(entries, (entry) => entry.vehicleId === vehicleId && entry.kind === "despesa");
  return { revenue, cost, profit: revenue - cost };
}

export function workspaceTotals(entries: Entry[], workspace: Workspace) {
  const revenue = sumCents(entries, (entry) => entry.workspace === workspace && entry.kind === "receita");
  const expense = sumCents(entries, (entry) => entry.workspace === workspace && entry.kind === "despesa");
  return { revenue, expense, result: revenue - expense };
}

export function vehicleName(vehicles: Vehicle[], vehicleId: string | null) {
  if (!vehicleId) return "—";
  return vehicles.find((vehicle) => vehicle.id === vehicleId)?.name ?? "Veículo removido";
}

export function marginLabel(profit: number, revenue: number) {
  if (revenue <= 0) return "—";
  return `${Math.round((profit / revenue) * 100)}%`;
}
