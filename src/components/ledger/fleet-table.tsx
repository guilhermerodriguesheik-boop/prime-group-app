"use client";

import Link from "next/link";
import { formatCents } from "@/lib/ledger/money";
import { marginLabel, vehicleResult } from "@/lib/ledger/selectors";
import { useLedger } from "./use-ledger";

export function FleetTable() {
  const { vehicles, entries } = useLedger();

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Veículo</th><th>Receita</th><th>Custo</th><th>Lucro</th><th>Margem</th><th>KM/L</th></tr>
        </thead>
        <tbody>
          {vehicles.map((vehicle) => {
            const result = vehicleResult(entries, vehicle.id);
            return (
              <tr key={vehicle.id}>
                <td><b>{vehicle.name}</b></td>
                <td>{formatCents(result.revenue)}</td>
                <td>{formatCents(result.cost)}</td>
                <td className={result.profit >= 0 ? "positive" : "warning"}>{formatCents(result.profit)}</td>
                <td>{marginLabel(result.profit, result.revenue)}</td>
                <td>{vehicle.kmPerLiter ? vehicle.kmPerLiter.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"}</td>
              </tr>
            );
          })}
          {vehicles.length === 0 && (
            <tr><td colSpan={6}>Nenhum veículo cadastrado. <Link href="/cadastros?parte=veiculos">Cadastrar veículo</Link></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function FleetCards() {
  const { vehicles, entries } = useLedger();

  if (vehicles.length === 0) {
    return <div className="notice">Nenhum veículo cadastrado. <Link href="/cadastros?parte=veiculos">Cadastrar o primeiro veículo</Link></div>;
  }

  return (
    <div className="grid grid-3">
      {vehicles.map((vehicle) => {
        const result = vehicleResult(entries, vehicle.id);
        return (
          <div className="card" key={vehicle.id}>
            <h3>{vehicle.name}</h3>
            <div className={`metric-value ${result.profit >= 0 ? "positive" : "warning"}`}>{formatCents(result.profit)}</div>
            <div className="metric-foot">
              lucro no período
              {vehicle.kmPerLiter ? ` · ${vehicle.kmPerLiter.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km/l` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
