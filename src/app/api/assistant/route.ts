import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(8000),
  workspaceId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  }

  const { message, workspaceId, conversationId } = parsed.data;

  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id,name,kind,currency")
    .order("kind");

  if (workspaceError) {
    return NextResponse.json({ error: "Não foi possível carregar os ambientes." }, { status: 500 });
  }

  const allowedWorkspace = workspaceId
    ? workspaces?.find((workspace) => workspace.id === workspaceId)
    : undefined;

  if (workspaceId && !allowedWorkspace) {
    return NextResponse.json({ error: "Ambiente inválido." }, { status: 403 });
  }

  const scopeIds = allowedWorkspace ? [allowedWorkspace.id] : (workspaces ?? []).map((workspace) => workspace.id);

  const [transactionsResult, receivablesResult, payablesResult, vehiclesResult, tripsResult] = await Promise.all([
    scopeIds.length
      ? supabase
          .from("transactions")
          .select("workspace_id,type,amount,occurred_at,description,status")
          .in("workspace_id", scopeIds)
          .order("occurred_at", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [], error: null }),
    scopeIds.length
      ? supabase
          .from("receivables")
          .select("workspace_id,description,amount,received_amount,due_date,status")
          .in("workspace_id", scopeIds)
          .in("status", ["open", "partial", "overdue"])
          .order("due_date")
          .limit(80)
      : Promise.resolve({ data: [], error: null }),
    scopeIds.length
      ? supabase
          .from("payables")
          .select("workspace_id,description,amount,paid_amount,due_date,status")
          .in("workspace_id", scopeIds)
          .in("status", ["open", "partial", "overdue"])
          .order("due_date")
          .limit(80)
      : Promise.resolve({ data: [], error: null }),
    scopeIds.length
      ? supabase
          .from("vehicles")
          .select("workspace_id,id,nickname,plate,status,odometer_km,estimated_value")
          .in("workspace_id", scopeIds)
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    scopeIds.length
      ? supabase
          .from("trips")
          .select("workspace_id,reference,origin,destination,distance_km,freight_revenue,status,started_at,ended_at")
          .in("workspace_id", scopeIds)
          .order("started_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const dataErrors = [
    transactionsResult.error,
    receivablesResult.error,
    payablesResult.error,
    vehiclesResult.error,
    tripsResult.error,
  ].filter(Boolean);

  if (dataErrors.length) {
    return NextResponse.json({ error: "Falha ao consultar os dados financeiros." }, { status: 500 });
  }

  let activeConversationId = conversationId;

  if (activeConversationId) {
    const { data: existing } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", activeConversationId)
      .maybeSingle();

    if (!existing) activeConversationId = undefined;
  }

  if (!activeConversationId) {
    const { data: conversation, error } = await supabase
      .from("ai_conversations")
      .insert({
        user_id: user.id,
        workspace_id: allowedWorkspace?.id ?? null,
        title: message.slice(0, 90),
      })
      .select("id")
      .single();

    if (!error) activeConversationId = conversation.id;
  }

  if (activeConversationId) {
    await supabase.from("ai_messages").insert({
      conversation_id: activeConversationId,
      role: "user",
      content: message,
    });
  }

  const context = {
    generatedAt: new Date().toISOString(),
    currency: "BRL",
    workspaces,
    selectedWorkspace: allowedWorkspace ?? null,
    transactions: transactionsResult.data ?? [],
    receivables: receivablesResult.data ?? [],
    payables: payablesResult.data ?? [],
    vehicles: vehiclesResult.data ?? [],
    trips: tripsResult.data ?? [],
  };

  try {
    const result = await generateText({
      model: process.env.PRIME_AI_MODEL || "openai/gpt-5.6-luna",
      system: `Você é o assistente financeiro do Prime Finance.
Responda em português do Brasil, de forma objetiva e numérica.
Use somente os dados fornecidos no contexto para afirmar valores do usuário.
Se os dados forem insuficientes, diga exatamente o que está faltando.
Valores monetários são em BRL salvo indicação contrária.
Não invente saldos, pagamentos, datas, clientes ou veículos.
Não execute nem afirme que executou lançamentos financeiros; esta rota é somente consulta e análise.
Diferencie Prime Group, Pessoal e Recebíveis/Juros e nunca misture as contabilidades sem avisar.
Ao fazer cálculos, explique resumidamente a composição do resultado.\nNão use Markdown, asteriscos, hashtags ou tabelas. Responda em texto simples, com parágrafos curtos.`,
      prompt: `PERGUNTA DO USUÁRIO:
${message}

CONTEXTO ATUAL DO PRIME FINANCE:
${JSON.stringify(context)}`,
    });

    if (activeConversationId) {
      await supabase.from("ai_messages").insert({
        conversation_id: activeConversationId,
        role: "assistant",
        content: result.text,
        metadata: {
          model: process.env.PRIME_AI_MODEL || "openai/gpt-5.6-luna",
          usage: result.usage ?? null,
        },
      });
    }

    return NextResponse.json({
      answer: result.text,
      conversationId: activeConversationId ?? null,
      model: process.env.PRIME_AI_MODEL || "openai/gpt-5.6-luna",
    });
  } catch (error) {
    console.error("Prime Finance AI error", error);

    const rawMessage = error instanceof Error ? error.message : "Falha desconhecida no AI Gateway.";
    const safeMessage = rawMessage
      .replace(/Bearer\\s+[A-Za-z0-9._~+\\/-]+/gi, "Bearer [redacted]")
      .replace(/(?:sk|key|token)_[A-Za-z0-9_-]{12,}/gi, "[redacted]");

    return NextResponse.json(
      {
        error: "A IA não respondeu.",
        detail: safeMessage.slice(0, 500),
        gatewayAuth: process.env.VERCEL_OIDC_TOKEN
          ? "OIDC disponível"
          : process.env.AI_GATEWAY_API_KEY
            ? "API key disponível"
            : "Sem credencial do AI Gateway",
        model: process.env.PRIME_AI_MODEL || "openai/gpt-5.6-luna",
      },
      { status: 502 },
    );
  }
}
