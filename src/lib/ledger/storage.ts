import { createSeed } from "./seed";
import type { LedgerState } from "./types";

export const LEDGER_STORAGE_KEY = "prime-finance-cadastro-v1";
export const LEDGER_EVENT = "prime-ledger";

const serverLedger = createSeed();
let memoryRaw: string | null | undefined;
let memoryLedger: LedgerState = serverLedger;

export function getServerLedger() {
  return serverLedger;
}

export function getClientLedger(): LedgerState {
  if (typeof window === "undefined") return serverLedger;
  const raw = window.localStorage.getItem(LEDGER_STORAGE_KEY);
  if (raw === memoryRaw) return memoryLedger;

  memoryRaw = raw;
  if (!raw) {
    memoryLedger = serverLedger;
    return memoryLedger;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LedgerState>;
    if (parsed && Array.isArray(parsed.vehicles) && Array.isArray(parsed.accounts) && Array.isArray(parsed.entries)) {
      memoryLedger = {
        vehicles: parsed.vehicles,
        accounts: parsed.accounts,
        entries: parsed.entries,
      };
      return memoryLedger;
    }
  } catch {
    memoryLedger = serverLedger;
  }

  memoryLedger = serverLedger;
  return memoryLedger;
}

export function saveLedger(state: LedgerState) {
  const raw = JSON.stringify(state);
  memoryLedger = state;
  memoryRaw = raw;
  window.localStorage.setItem(LEDGER_STORAGE_KEY, raw);
  window.dispatchEvent(new Event(LEDGER_EVENT));
}

export function subscribeLedger(onStoreChange: () => void) {
  window.addEventListener(LEDGER_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(LEDGER_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}
