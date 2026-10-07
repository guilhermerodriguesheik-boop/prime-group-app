import { createHash } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { AssistantDocument } from "./documents";

type Workspace = { id: string; name: string; kind: string };
type Account = { id: string; workspace_id: string; name: string; institution: string | null };
type Card = { id: string; workspace_id: string; name: string; issuer: string | null; last4: string | null };
type Vehicle = { id: string; workspace_id: string; nickname: string; plate: string | null; model: string | null };
type Counterparty = { id: string; workspace_id: string; name: string; document: string | null; kind: string };

export type ExecutedAssistantAction = {
  type: string;
  label: string;
  status: "executed" | "reused";
  result: Json;
};

type CreateToolsInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  conversationId: string | null;
  originalMessage: string;
  documentIds: string[];
  documents: AssistantDocument[];
  workspaces: Workspace[];
  accounts: Account[];
  cards: Card[];
  vehicles: Vehicle[];
  counterparties: Counterparty[];
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function jsonValue(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function pickOne<T>(
  items: T[],
  query: string | undefined,
  fields: (item: T) => Array<string | null | undefined>,
): T | null {
  if (!query?.trim()) return null;
  const needle = normalize(query);
  const exact = items.filter((item) => fields(item).some((field) => field && normalize(field) === needle));
  if (exact.length === 1) return exact[0];
  const partial = items.filter((item) => fields(item).some((field) => field && normalize(field).includes(needle)));
  return partial.length === 1 ? partial[0] : null;
}

function actionLabel(actionType: string) {
  const labels: Record<string, string> = {
    create_transaction: "Lançamento financeiro",
    create_receivable: "Conta a receber",
    create_payable: "Conta a pagar",
    create_counterparty: "Pessoa/empresa",
    create_vehicle: "Veículo",
    create_account: "Conta bancária/carteira",
    create_card: "Cartão",
    create_trip: "Viagem",
    create_cte: "CT-e",
    create_recurring: "Recorrência",
    settle_receivable: "Baixa de recebível",
    settle_payable: "Baixa de conta a pagar",
  };
  return labels[actionType] ?? actionType;
}

export function createAssistantTools(input: CreateToolsInput) {
  const {
    supabase,
    userId,
    conversationId,
    originalMessage,
    documentIds,
    documents,
    workspaces,
    accounts,
    cards,
    vehicles,
    counterparties,
  } = input;

  const actions: ExecutedAssistantAction[] = [];

  function workspace(kind: "prime" | "personal" | "interest") {
    const found = workspaces.find((item) => item.kind === kind);
    if (!found) throw new Error(`Ambiente ${kind} não encontrado.`);
    return found;
  }

  async function runAction<T extends Record<string, unknown>>(
    actionType: string,
    workspaceId: string | null,
    actionInput: Record<string, unknown>,
    execute: (actionId: string) => Promise<T>,
  ): Promise<T & { reused?: boolean }> {
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          userId,
          conversationId,
          actionType,
          actionInput,
          documentIds: [...documentIds].sort(),
        }),
      )
      .digest("hex");

    const { data: existing } = await supabase
      .from("assistant_actions")
      .select("id,status,result")
      .eq("idempotency_key", key)
      .maybeSingle();

    if (existing?.status === "executed") {
      const result = (existing.result ?? {}) as Json;
      actions.push({ type: actionType, label: actionLabel(actionType), status: "reused", result });
      return { ...(result as T), reused: true };
    }

    let actionId = existing?.id ?? null;

    if (!actionId) {
      const { data: created, error } = await supabase
        .from("assistant_actions")
        .insert({
          user_id: userId,
          workspace_id: workspaceId,
          conversation_id: conversationId,
          action_type: actionType,
          input: jsonValue(actionInput),
          status: "pending",
          idempotency_key: key,
        })
        .select("id")
        .single();

      if (error) {
        if (error.code === "23505") {
          const { data: raced } = await supabase
            .from("assistant_actions")
            .select("id,status,result")
            .eq("idempotency_key", key)
            .single();

          if (raced.status === "executed") {
            const result = (raced.result ?? {}) as Json;
            actions.push({ type: actionType, label: actionLabel(actionType), status: "reused", result });
            return { ...(result as T), reused: true };
          }
          actionId = raced.id;
        } else {
          throw error;
        }
      } else {
        actionId = created.id;
      }
    }

    if (!actionId) throw new Error("Não foi possível criar o registro de auditoria da IA.");

    try {
      const result = await execute(actionId);
      const safeResult = jsonValue(result);
      await supabase
        .from("assistant_actions")
        .update({ status: "executed", result: safeResult })
        .eq("id", actionId);
      actions.push({ type: actionType, label: actionLabel(actionType), status: "executed", result: safeResult });
      return result;
    } catch (error) {
      await supabase
        .from("assistant_actions")
        .update({
          status: "failed",
          result: jsonValue({ error: error instanceof Error ? error.message : "Falha desconhecida" }),
        })
        .eq("id", actionId);
      throw error;
    }
  }

  function resolveAccount(workspaceId: string, query?: string) {
    return pickOne(
      accounts.filter((item) => item.workspace_id === workspaceId),
      query,
      (item) => [item.name, item.institution],
    );
  }

  function resolveCard(workspaceId: string, query?: string) {
    return pickOne(
      cards.filter((item) => item.workspace_id === workspaceId),
      query,
      (item) => [item.name, item.issuer, item.last4],
    );
  }

  function resolveVehicle(workspaceId: string, query?: string) {
    return pickOne(
      vehicles.filter((item) => item.workspace_id === workspaceId),
      query,
      (item) => [item.nickname, item.plate, item.model],
    );
  }

  function resolveCounterparty(workspaceId: string, query?: string) {
    return pickOne(
      counterparties.filter((item) => item.workspace_id === workspaceId),
      query,
      (item) => [item.name, item.document],
    );
  }

  const tools = {
    registrar_movimento: tool({
      description:
        "Registra uma receita ou despesa já realizada. Use somente quando o usuário pedir para lançar/registrar uma movimentação ou quando um comprovante enviado deixar o gasto/receita inequívoco.",
      inputSchema: z.object({
        workspaceKind: z.enum(["prime", "personal", "interest"]),
        type: z.enum(["income", "expense"]),
        amount: z.number().positive(),
        description: z.string().min(2),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        accountName: z.string().optional(),
        cardName: z.string().optional(),
        vehicleNameOrPlate: z.string().optional(),
        counterpartyName: z.string().optional(),
      }),
      execute: async (args) => {
        const ws = workspace(args.workspaceKind);
        return runAction("create_transaction", ws.id, args, async (actionId) => {
          const account = resolveAccount(ws.id, args.accountName);
          const card = resolveCard(ws.id, args.cardName);
          const vehicle = resolveVehicle(ws.id, args.vehicleNameOrPlate);
          const counterparty = resolveCounterparty(ws.id, args.counterpartyName);
          const occurredAt = args.date ? `${args.date}T12:00:00-03:00` : new Date().toISOString();

          const { data, error } = await supabase
            .from("transactions")
            .insert({
              workspace_id: ws.id,
              account_id: account?.id ?? null,
              card_id: card?.id ?? null,
              vehicle_id: vehicle?.id ?? null,
              counterparty_id: counterparty?.id ?? null,
              type: args.type,
              amount: args.amount,
              occurred_at: occurredAt,
              description: args.description,
              status: "posted",
              source: "assistant",
              external_id: `assistant_action:${actionId}`,
              metadata: jsonValue({ document_ids: documentIds }),
              created_by: userId,
            })
            .select("id")
            .single();

          if (error) throw error;
          return { ok: true, transactionId: data.id, amount: args.amount, type: args.type };
        });
      },
    }),

    registrar_conta_receber: tool({
      description: "Cria uma conta a receber futura. Não use para receita já recebida; nesse caso use registrar_movimento.",
      inputSchema: z.object({
        workspaceKind: z.enum(["prime", "personal", "interest"]),
        description: z.string().min(2),
        amount: z.number().positive(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        counterpartyName: z.string().optional(),
      }),
      execute: async (args) => {
        const ws = workspace(args.workspaceKind);
        return runAction("create_receivable", ws.id, args, async (actionId) => {
          const counterparty = resolveCounterparty(ws.id, args.counterpartyName);
          const { data, error } = await supabase
            .from("receivables")
            .insert({
              workspace_id: ws.id,
              counterparty_id: counterparty?.id ?? null,
              description: args.description,
              amount: args.amount,
              due_date: args.dueDate,
              received_amount: 0,
              status: "open",
              source: "assistant",
              external_id: `assistant_action:${actionId}`,
            })
            .select("id")
            .single();
          if (error) throw error;
          return { ok: true, receivableId: data.id, amount: args.amount, dueDate: args.dueDate };
        });
      },
    }),

    registrar_conta_pagar: tool({
      description: "Cria uma conta a pagar futura. Não use para uma despesa que já foi paga; use registrar_movimento.",
      inputSchema: z.object({
        workspaceKind: z.enum(["prime", "personal", "interest"]),
        description: z.string().min(2),
        amount: z.number().positive(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        counterpartyName: z.string().optional(),
      }),
      execute: async (args) => {
        const ws = workspace(args.workspaceKind);
        return runAction("create_payable", ws.id, args, async (actionId) => {
          const counterparty = resolveCounterparty(ws.id, args.counterpartyName);
          const { data, error } = await supabase
            .from("payables")
            .insert({
              workspace_id: ws.id,
              counterparty_id: counterparty?.id ?? null,
              description: args.description,
              amount: args.amount,
              due_date: args.dueDate,
              paid_amount: 0,
              status: "open",
            })
            .select("id")
            .single();
          if (error) throw error;
          return { ok: true, payableId: data.id, auditRef: actionId, amount: args.amount, dueDate: args.dueDate };
        });
      },
    }),

    cadastrar_pessoa_empresa: tool({
      description: "Cadastra cliente, fornecedor, devedor, credor, motorista ou outra pessoa/empresa.",
      inputSchema: z.object({
        workspaceKind: z.enum(["prime", "personal", "interest"]),
        name: z.string().min(2),
        kind: z.enum(["customer", "supplier", "borrower", "lender", "driver", "other"]),
        document: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (args) => {
        const ws = workspace(args.workspaceKind);
        return runAction("create_counterparty", ws.id, args, async () => {
          const existing = resolveCounterparty(ws.id, args.document || args.name);
          if (existing) return { ok: true, counterpartyId: existing.id, alreadyExisted: true, name: existing.name };

          const { data, error } = await supabase
            .from("counterparties")
            .insert({
              workspace_id: ws.id,
              name: args.name,
              kind: args.kind,
              document: args.document ?? null,
              phone: args.phone ?? null,
              email: args.email ?? null,
              notes: args.notes ?? null,
            })
            .select("id")
            .single();
          if (error) throw error;
          return { ok: true, counterpartyId: data.id, name: args.name };
        });
      },
    }),

    cadastrar_veiculo: tool({
      description: "Cadastra um veículo da Prime Group.",
      inputSchema: z.object({
        nickname: z.string().min(2),
        plate: z.string().optional(),
        make: z.string().optional(),
        model: z.string().optional(),
        year: z.number().int().min(1950).max(2100).optional(),
        odometerKm: z.number().nonnegative().optional(),
        estimatedValue: z.number().nonnegative().optional(),
      }),
      execute: async (args) => {
        const ws = workspace("prime");
        return runAction("create_vehicle", ws.id, args, async () => {
          const existing = resolveVehicle(ws.id, args.plate || args.nickname);
          if (existing) return { ok: true, vehicleId: existing.id, alreadyExisted: true, nickname: existing.nickname };

          const { data, error } = await supabase
            .from("vehicles")
            .insert({
              workspace_id: ws.id,
              nickname: args.nickname,
              plate: args.plate?.toUpperCase() ?? null,
              make: args.make ?? null,
              model: args.model ?? null,
              year: args.year ?? null,
              odometer_km: args.odometerKm ?? null,
              estimated_value: args.estimatedValue ?? null,
              status: "active",
            })
            .select("id")
            .single();
          if (error) throw error;
          return { ok: true, vehicleId: data.id, nickname: args.nickname };
        });
      },
    }),

    cadastrar_conta: tool({
      description: "Cadastra uma conta bancária, carteira, investimento ou caixa.",
      inputSchema: z.object({
        workspaceKind: z.enum(["prime", "personal", "interest"]),
        name: z.string().min(2),
        institution: z.string().optional(),
        accountType: z.enum(["checking", "savings", "cash", "wallet", "investment", "other"]).optional(),
        openingBalance: z.number().optional(),
      }),
      execute: async (args) => {
        const ws = workspace(args.workspaceKind);
        return runAction("create_account", ws.id, args, async () => {
          const existing = resolveAccount(ws.id, args.name);
          if (existing) return { ok: true, accountId: existing.id, alreadyExisted: true, name: existing.name };
          const { data, error } = await supabase
            .from("accounts")
            .insert({
              workspace_id: ws.id,
              name: args.name,
              institution: args.institution ?? null,
              account_type: args.accountType ?? "checking",
              opening_balance: args.openingBalance ?? 0,
              active: true,
            })
            .select("id")
            .single();
          if (error) throw error;
          return { ok: true, accountId: data.id, name: args.name };
        });
      },
    }),

    cadastrar_cartao: tool({
      description: "Cadastra um cartão de crédito.",
      inputSchema: z.object({
        workspaceKind: z.enum(["prime", "personal", "interest"]),
        name: z.string().min(2),
        issuer: z.string().optional(),
        last4: z.string().max(4).optional(),
        closingDay: z.number().int().min(1).max(31).optional(),
        dueDay: z.number().int().min(1).max(31).optional(),
        creditLimit: z.number().nonnegative().optional(),
        paymentAccountName: z.string().optional(),
      }),
      execute: async (args) => {
        const ws = workspace(args.workspaceKind);
        return runAction("create_card", ws.id, args, async () => {
          const existing = resolveCard(ws.id, args.last4 || args.name);
          if (existing) return { ok: true, cardId: existing.id, alreadyExisted: true, name: existing.name };
          const account = resolveAccount(ws.id, args.paymentAccountName);
          const { data, error } = await supabase
            .from("cards")
            .insert({
              workspace_id: ws.id,
              account_id: account?.id ?? null,
              name: args.name,
              issuer: args.issuer ?? null,
              last4: args.last4 ?? null,
              closing_day: args.closingDay ?? null,
              due_day: args.dueDay ?? null,
              credit_limit: args.creditLimit ?? null,
              active: true,
            })
            .select("id")
            .single();
          if (error) throw error;
          return { ok: true, cardId: data.id, name: args.name };
        });
      },
    }),

    cadastrar_viagem: tool({
      description: "Cadastra uma viagem/frete da Prime Group.",
      inputSchema: z.object({
        reference: z.string().optional(),
        origin: z.string().optional(),
        destination: z.string().optional(),
        vehicleNameOrPlate: z.string().optional(),
        customerName: z.string().optional(),
        freightRevenue: z.number().nonnegative().optional(),
        distanceKm: z.number().nonnegative().optional(),
        startedAt: z.string().optional(),
        status: z.enum(["planned", "in_progress", "completed", "cancelled"]).optional(),
      }),
      execute: async (args) => {
        const ws = workspace("prime");
        return runAction("create_trip", ws.id, args, async () => {
          const vehicle = resolveVehicle(ws.id, args.vehicleNameOrPlate);
          const customer = resolveCounterparty(ws.id, args.customerName);
          const { data, error } = await supabase
            .from("trips")
            .insert({
              workspace_id: ws.id,
              vehicle_id: vehicle?.id ?? null,
              customer_id: customer?.id ?? null,
              reference: args.reference ?? null,
              origin: args.origin ?? null,
              destination: args.destination ?? null,
              freight_revenue: args.freightRevenue ?? 0,
              distance_km: args.distanceKm ?? null,
              started_at: args.startedAt ?? null,
              status: args.status ?? "planned",
            })
            .select("id")
            .single();
          if (error) throw error;
          return { ok: true, tripId: data.id, reference: args.reference ?? null };
        });
      },
    }),

    registrar_cte: tool({
      description:
        "Registra um CT-e extraído de XML, PDF ou imagem. Use a chave de acesso para evitar duplicidade. Pode criar a viagem e, somente se houver vencimento claro, a conta a receber.",
      inputSchema: z.object({
        documentId: z.string().uuid().optional(),
        accessKey: z.string().optional(),
        number: z.string().optional(),
        series: z.string().optional(),
        issuedAt: z.string().optional(),
        senderName: z.string().optional(),
        recipientName: z.string().optional(),
        totalValue: z.number().nonnegative().optional(),
        origin: z.string().optional(),
        destination: z.string().optional(),
        vehicleNameOrPlate: z.string().optional(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
      execute: async (args) => {
        const ws = workspace("prime");
        const doc = args.documentId ? documents.find((item) => item.id === args.documentId) : documents[0];
        const externalKey = args.accessKey ? `cte:${args.accessKey}` : doc ? `document:${doc.id}:cte` : undefined;

        return runAction("create_cte", ws.id, args, async (actionId) => {
          if (externalKey) {
            const { data: existing } = await supabase
              .from("cte_documents")
              .select("id,trip_id")
              .eq("external_id", externalKey)
              .maybeSingle();
            if (existing) return { ok: true, cteId: existing.id, tripId: existing.trip_id, alreadyExisted: true };
          }

          const vehicle = resolveVehicle(ws.id, args.vehicleNameOrPlate);
          let tripId: string | null = null;

          if (args.origin || args.destination || args.totalValue || vehicle) {
            const { data: trip, error: tripError } = await supabase
              .from("trips")
              .insert({
                workspace_id: ws.id,
                vehicle_id: vehicle?.id ?? null,
                reference: args.number ? `CT-e ${args.number}` : args.accessKey ? `CT-e ${args.accessKey.slice(-10)}` : "CT-e",
                origin: args.origin ?? null,
                destination: args.destination ?? null,
                freight_revenue: args.totalValue ?? 0,
                started_at: args.issuedAt ?? null,
                status: "planned",
              })
              .select("id")
              .single();
            if (tripError) throw tripError;
            tripId = trip.id;
          }

          const { data: cte, error: cteError } = await supabase
            .from("cte_documents")
            .insert({
              workspace_id: ws.id,
              trip_id: tripId,
              access_key: args.accessKey ?? null,
              number: args.number ?? null,
              series: args.series ?? null,
              issued_at: args.issuedAt ?? null,
              sender_name: args.senderName ?? null,
              recipient_name: args.recipientName ?? null,
              total_value: args.totalValue ?? null,
              xml_path: doc?.mimeType.includes("xml") ? doc.storagePath : null,
              source: "assistant",
              external_id: externalKey ?? `assistant_action:${actionId}`,
              status: "imported",
            })
            .select("id")
            .single();
          if (cteError) throw cteError;

          let receivableId: string | null = null;
          if (args.dueDate && (args.totalValue ?? 0) > 0) {
            const receivableExternal = externalKey ? `${externalKey}:receivable` : `assistant_action:${actionId}:receivable`;
            const { data: existingReceivable } = await supabase
              .from("receivables")
              .select("id")
              .eq("external_id", receivableExternal)
              .maybeSingle();

            if (existingReceivable) {
              receivableId = existingReceivable.id;
            } else {
              const { data: receivable, error: receivableError } = await supabase
                .from("receivables")
                .insert({
                  workspace_id: ws.id,
                  description: args.number ? `Frete CT-e ${args.number}` : "Frete de CT-e",
                  amount: args.totalValue ?? 0,
                  due_date: args.dueDate,
                  received_amount: 0,
                  status: "open",
                  source: "assistant",
                  external_id: receivableExternal,
                })
                .select("id")
                .single();
              if (receivableError) throw receivableError;
              receivableId = receivable.id;
            }
          }

          if (doc) {
            await supabase
              .from("documents")
              .update({ related_table: "cte_documents", related_id: cte.id })
              .eq("id", doc.id);
          }

          return { ok: true, cteId: cte.id, tripId, receivableId };
        });
      },
    }),

    cadastrar_recorrencia: tool({
      description: "Cadastra uma receita ou despesa recorrente/fixa.",
      inputSchema: z.object({
        workspaceKind: z.enum(["prime", "personal", "interest"]),
        name: z.string().min(2),
        type: z.enum(["income", "expense"]),
        amount: z.number().positive(),
        frequency: z.enum(["weekly", "monthly", "quarterly", "yearly", "custom"]),
        dueDay: z.number().int().min(1).max(31).optional(),
        startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
      execute: async (args) => {
        const ws = workspace(args.workspaceKind);
        return runAction("create_recurring", ws.id, args, async () => {
          const { data, error } = await supabase
            .from("recurring_entries")
            .insert({
              workspace_id: ws.id,
              name: args.name,
              type: args.type,
              amount: args.amount,
              frequency: args.frequency,
              due_day: args.dueDay ?? null,
              starts_on: args.startsOn,
              ends_on: args.endsOn ?? null,
              active: true,
            })
            .select("id")
            .single();
          if (error) throw error;
          return { ok: true, recurringId: data.id, name: args.name };
        });
      },
    }),

    dar_baixa_recebivel: tool({
      description:
        "Marca um recebível como recebido e cria a entrada financeira. SOMENTE use quando o usuário disser explicitamente que recebeu, quer dar baixa, marcar como recebido ou quitar.",
      inputSchema: z.object({
        receivableId: z.string().uuid().optional(),
        descriptionContains: z.string().optional(),
      }),
      execute: async (args) => {
        if (!/(recebi|recebido|dar baixa|baixa|quitar|quitado|marcar.*recebid)/i.test(originalMessage)) {
          return { ok: false, needsExplicitConfirmation: true, message: "A baixa exige pedido explícito do usuário." };
        }

        let receivableId = args.receivableId;
        if (!receivableId && args.descriptionContains) {
          const { data } = await supabase
            .from("receivables")
            .select("id,description")
            .in("status", ["open", "partial", "overdue"])
            .limit(100);
          const matches = (data ?? []).filter((item) =>
            normalize(item.description).includes(normalize(args.descriptionContains ?? "")),
          );
          if (matches.length === 1) receivableId = matches[0].id;
          else throw new Error("Recebível ambíguo. Informe qual lançamento deve ser baixado.");
        }
        if (!receivableId) throw new Error("Recebível não identificado.");

        const { data: row, error: rowError } = await supabase
          .from("receivables")
          .select("workspace_id,description")
          .eq("id", receivableId)
          .single();
        if (rowError) throw rowError;

        return runAction("settle_receivable", row.workspace_id, { receivableId }, async () => {
          const { data, error } = await supabase.rpc("settle_receivable", { p_receivable_id: receivableId });
          if (error) throw error;
          return { ok: true, receivableId, transactionId: data, description: row.description };
        });
      },
    }),

    dar_baixa_conta_pagar: tool({
      description:
        "Marca uma conta como paga e cria a saída financeira. SOMENTE use quando o usuário disser explicitamente que pagou, quer dar baixa, marcar como paga ou quitar.",
      inputSchema: z.object({
        payableId: z.string().uuid().optional(),
        descriptionContains: z.string().optional(),
      }),
      execute: async (args) => {
        if (!/(paguei|pago|dar baixa|baixa|quitar|quitado|marcar.*pag)/i.test(originalMessage)) {
          return { ok: false, needsExplicitConfirmation: true, message: "A baixa exige pedido explícito do usuário." };
        }

        let payableId = args.payableId;
        if (!payableId && args.descriptionContains) {
          const { data } = await supabase
            .from("payables")
            .select("id,description")
            .in("status", ["open", "partial", "overdue"])
            .limit(100);
          const matches = (data ?? []).filter((item) =>
            normalize(item.description).includes(normalize(args.descriptionContains ?? "")),
          );
          if (matches.length === 1) payableId = matches[0].id;
          else throw new Error("Conta ambígua. Informe qual lançamento deve ser baixado.");
        }
        if (!payableId) throw new Error("Conta a pagar não identificada.");

        const { data: row, error: rowError } = await supabase
          .from("payables")
          .select("workspace_id,description")
          .eq("id", payableId)
          .single();
        if (rowError) throw rowError;

        return runAction("settle_payable", row.workspace_id, { payableId }, async () => {
          const { data, error } = await supabase.rpc("settle_payable", { p_payable_id: payableId });
          if (error) throw error;
          return { ok: true, payableId, transactionId: data, description: row.description };
        });
      },
    }),
  };

  return { tools, actions };
}
