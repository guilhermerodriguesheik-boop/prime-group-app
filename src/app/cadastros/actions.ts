"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(formData: FormData, key: string) {
  const raw = textValue(formData, key).replace(/^R\$/i, "").replace(/\s/g, "");
  if (!raw) return 0;
  let normalized = raw;
  if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  return { supabase, user };
}

async function workspaceId(kind: "prime" | "personal" | "interest") {
  const { supabase } = await context();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("kind", kind)
    .single();
  if (error || !data) throw error ?? new Error("Ambiente não encontrado");
  return data.id;
}

function refreshAll() {
  ["/", "/cadastros", "/prime", "/pessoal", "/juros", "/contas", "/planejamento", "/relatorios", "/frota", "/viagens"].forEach((path) => revalidatePath(path));
}

export async function createAccount(formData: FormData) {
  const { supabase } = await context();
  const workspace = textValue(formData, "workspace") as "prime" | "personal" | "interest";
  const id = await workspaceId(workspace);
  const { error } = await supabase.from("accounts").insert({
    workspace_id: id,
    name: textValue(formData, "name"),
    institution: textValue(formData, "institution") || null,
    account_type: textValue(formData, "account_type") || "checking",
    opening_balance: numberValue(formData, "opening_balance"),
  });
  if (error) throw error;
  refreshAll();
}

export async function createVehicle(formData: FormData) {
  const { supabase } = await context();
  const id = await workspaceId("prime");
  const year = numberValue(formData, "year");
  const { error } = await supabase.from("vehicles").insert({
    workspace_id: id,
    nickname: textValue(formData, "nickname"),
    plate: textValue(formData, "plate").toUpperCase() || null,
    make: textValue(formData, "make") || null,
    model: textValue(formData, "model") || null,
    year: year || null,
    odometer_km: numberValue(formData, "odometer_km") || null,
    estimated_value: numberValue(formData, "estimated_value") || null,
    status: "active",
  });
  if (error) throw error;
  refreshAll();
}

export async function createTransaction(formData: FormData) {
  const { supabase, user } = await context();
  const workspace = textValue(formData, "workspace") as "prime" | "personal" | "interest";
  const id = await workspaceId(workspace);
  const mode = textValue(formData, "entry_mode") || "expense";
  const type = mode === "card_purchase" ? "expense" : mode as "income" | "expense" | "card_payment";
  const occurred = textValue(formData, "occurred_at");
  const accountId = textValue(formData, "account_id") || null;
  const selectedCardId = textValue(formData, "card_id") || null;
  const cardId = mode === "card_purchase" || mode === "card_payment" ? selectedCardId : null;
  const vehicleId = textValue(formData, "vehicle_id") || null;
  const amount = numberValue(formData, "amount");

  if (amount <= 0) throw new Error("Informe um valor maior que zero.");
  if (mode === "card_purchase" && !cardId) throw new Error("Selecione o cartão da compra.");
  if (mode === "card_payment" && (!cardId || !accountId)) throw new Error("Pagamento de fatura exige conta de saída e cartão.");

  if (accountId) {
    const { data: account } = await supabase.from("accounts").select("workspace_id").eq("id", accountId).maybeSingle();
    if (!account || account.workspace_id !== id) throw new Error("A conta selecionada pertence a outro ambiente.");
  }
  if (cardId) {
    const { data: card } = await supabase.from("cards").select("workspace_id").eq("id", cardId).maybeSingle();
    if (!card || card.workspace_id !== id) throw new Error("O cartão selecionado pertence a outro ambiente.");
  }
  if (vehicleId) {
    const { data: vehicle } = await supabase.from("vehicles").select("workspace_id").eq("id", vehicleId).maybeSingle();
    if (!vehicle || vehicle.workspace_id !== id) throw new Error("O veículo selecionado pertence a outro ambiente.");
  }

  const { error } = await supabase.from("transactions").insert({
    workspace_id: id,
    account_id: accountId,
    card_id: cardId,
    vehicle_id: vehicleId,
    type,
    amount,
    occurred_at: occurred ? occurred + "T12:00:00-03:00" : new Date().toISOString(),
    description: textValue(formData, "description"),
    status: "posted",
    source: "manual",
    created_by: user.id,
  });
  if (error) throw error;
  refreshAll();
}

export async function createReceivable(formData: FormData) {
  const { supabase } = await context();
  const workspace = textValue(formData, "workspace") as "prime" | "personal" | "interest";
  const id = await workspaceId(workspace);
  const { error } = await supabase.from("receivables").insert({
    workspace_id: id,
    description: textValue(formData, "description"),
    amount: numberValue(formData, "amount"),
    due_date: textValue(formData, "due_date"),
    received_amount: 0,
    status: "open",
    source: "manual",
  });
  if (error) throw error;
  refreshAll();
}

export async function createPayable(formData: FormData) {
  const { supabase } = await context();
  const workspace = textValue(formData, "workspace") as "prime" | "personal" | "interest";
  const id = await workspaceId(workspace);
  const { error } = await supabase.from("payables").insert({
    workspace_id: id,
    description: textValue(formData, "description"),
    amount: numberValue(formData, "amount"),
    due_date: textValue(formData, "due_date"),
    paid_amount: 0,
    status: "open",
  });
  if (error) throw error;
  refreshAll();
}


export async function createCounterparty(formData: FormData) {
  const { supabase } = await context();
  const workspace = textValue(formData, "workspace") as "prime" | "personal" | "interest";
  const id = await workspaceId(workspace);
  const { error } = await supabase.from("counterparties").insert({
    workspace_id: id,
    name: textValue(formData, "name"),
    document: textValue(formData, "document") || null,
    phone: textValue(formData, "phone") || null,
    email: textValue(formData, "email") || null,
    kind: textValue(formData, "kind") || "other",
  });
  if (error) throw error;
  refreshAll();
}

export async function createLoan(formData: FormData) {
  const { supabase } = await context();
  const id = await workspaceId("interest");
  const rate = numberValue(formData, "periodic_rate");
  const fixedInterest = numberValue(formData, "fixed_interest");
  const { error } = await supabase.from("loans").insert({
    workspace_id: id,
    counterparty_id: textValue(formData, "counterparty_id"),
    direction: "receivable",
    principal: numberValue(formData, "principal"),
    periodic_rate: rate || null,
    rate_period: rate ? (textValue(formData, "rate_period") || "month") : null,
    interest_type: textValue(formData, "interest_type") || "simple",
    fixed_interest: fixedInterest || null,
    start_date: textValue(formData, "start_date"),
    maturity_date: textValue(formData, "maturity_date") || null,
    installment_frequency: textValue(formData, "installment_frequency") || "monthly",
    status: "active",
    notes: textValue(formData, "notes") || null,
  });
  if (error) throw error;
  refreshAll();
}


export async function settleReceivable(receivableId: string) {
  const { supabase } = await context();
  const { error } = await supabase.rpc("settle_receivable", { p_receivable_id: receivableId });
  if (error) throw error;
  refreshAll();
}

export async function settlePayable(payableId: string) {
  const { supabase } = await context();
  const { error } = await supabase.rpc("settle_payable", { p_payable_id: payableId });
  if (error) throw error;
  refreshAll();
}


export async function createCard(formData: FormData) {
  const { supabase } = await context();
  const workspace = textValue(formData, "workspace") as "prime" | "personal" | "interest";
  const id = await workspaceId(workspace);
  const { error } = await supabase.from("cards").insert({
    workspace_id: id,
    account_id: textValue(formData, "account_id") || null,
    name: textValue(formData, "name"),
    issuer: textValue(formData, "issuer") || null,
    last4: textValue(formData, "last4") || null,
    closing_day: numberValue(formData, "closing_day") || null,
    due_day: numberValue(formData, "due_day") || null,
    credit_limit: numberValue(formData, "credit_limit") || null,
    active: true,
  });
  if (error) throw error;
  refreshAll();
}

export async function createRecurringEntry(formData: FormData) {
  const { supabase } = await context();
  const workspace = textValue(formData, "workspace") as "prime" | "personal" | "interest";
  const id = await workspaceId(workspace);
  const { error } = await supabase.from("recurring_entries").insert({
    workspace_id: id,
    name: textValue(formData, "name"),
    type: textValue(formData, "type") as "income" | "expense",
    amount: numberValue(formData, "amount"),
    frequency: textValue(formData, "frequency") || "monthly",
    due_day: numberValue(formData, "due_day") || null,
    starts_on: textValue(formData, "starts_on") || new Date().toISOString().slice(0, 10),
    ends_on: textValue(formData, "ends_on") || null,
    active: true,
  });
  if (error) throw error;
  refreshAll();
  revalidatePath("/planejamento");
}
