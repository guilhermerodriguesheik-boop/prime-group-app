"use client";

import { useSyncExternalStore } from "react";
import { getClientLedger, getServerLedger, saveLedger, subscribeLedger } from "@/lib/ledger/storage";
import type { Account, Entry, LedgerState, Vehicle } from "@/lib/ledger/types";

function update(recipe: (current: LedgerState) => LedgerState) {
  saveLedger(recipe(getClientLedger()));
}

export function useLedger() {
  const state = useSyncExternalStore(subscribeLedger, getClientLedger, getServerLedger);

  return {
    ...state,
    addVehicle(vehicle: Vehicle) {
      update((current) => ({ ...current, vehicles: [vehicle, ...current.vehicles] }));
    },
    removeVehicle(id: string) {
      const linked = getClientLedger().entries.some((entry) => entry.vehicleId === id);
      if (linked) return "Este veículo tem lançamentos. Remova esses lançamentos antes.";
      update((current) => ({ ...current, vehicles: current.vehicles.filter((vehicle) => vehicle.id !== id) }));
      return null;
    },
    addAccount(account: Account) {
      update((current) => ({ ...current, accounts: [account, ...current.accounts] }));
    },
    removeAccount(id: string) {
      const linked = getClientLedger().entries.some((entry) => entry.accountId === id || entry.counterAccountId === id);
      if (linked) return "Esta conta tem lançamentos. Remova esses lançamentos antes.";
      update((current) => ({ ...current, accounts: current.accounts.filter((account) => account.id !== id) }));
      return null;
    },
    addEntry(entry: Entry) {
      update((current) => ({ ...current, entries: [entry, ...current.entries] }));
    },
    removeEntry(id: string) {
      update((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== id) }));
    },
  };
}
