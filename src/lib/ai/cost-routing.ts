/**
 * Roteamento de custo da IA do Prime Finance.
 *
 * Nao reusa PRIME_AGENT_MODEL: a configuracao antiga geralmente apontava
 * para gpt-6-astra e elevava o custo mesmo de mensagens simples.
 * A escolha por palavras-chave NAO decide autorizacao de gravacao financeira;
 * as ferramentas e regras do dominio continuam responsaveis por isso.
 */
export type AiChannel = "web" | "whatsapp";
export type AiTier = "economy" | "complex";
export type AiProfile = {
  model: string;
  tier: AiTier;
  reasoningEffort: "none" | "low" | "medium";
  maxOutputTokens: number;
};

const PRICE_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 0.10, output: 0.50 },
  "gpt-6.1-sol": { input: 2, output: 10 },
};

/** Usado apenas para estimar gasto, nao e uma fatura nem limite de cobranca. */
export function estimateAiCostUsd(
  model: string,
  usage: { inputTokens?: number; outputTokens?: number } | null | undefined,
): number | null {
  const price = PRICE_USD_PER_MILLION[model];
  if (!price || !usage) return null;
  const input = usage.inputTokens;
  const output = usage.outputTokens;
  if (typeof input !== "number" || typeof output !== "number" || !Number.isFinite(input) || !Number.isFinite(output)) {
    return null;
  }
  if (input < 0 || output < 0) return null;
  // Estimativa conservadora: tokens em cache sao cobrados aqui como entrada integral.
  return Math.round(((input * price.input + output * price.output) / 1_000_000) * 1e6) / 1e6;
}

const COMPLEX_INTENT =
  /\b(juros?|emprestimo|amortiza|capitaliza|inadimpl|tribut|imposto|icms|ibs|cbs|fiscal|cte|mdfe|rntrc|ciot|protest|judicial|juridic|contabil|balanco|conciliac|analis[ea]|comparativ|projec|previs|simul|planej|financiament|consorci|margem|lucro|rentabil|parcelament|estrateg|auditori|reforma|contrat)\w*/i;

const HIGH_STAKES =
  /\b(juros?|emprestimo|amortiza|capitaliza|inadimpl|tribut|imposto|icms|ibs|cbs|fiscal|cte|mdfe|rntrc|ciot|protest|judicial|juridic|contabil|conciliac|financiament)\w*/i;

function normalized(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function chooseAiProfile({
  message,
  hasVisual = false,
  channel = "web",
  environment = process.env,
}: {
  message: string;
  hasVisual?: boolean;
  channel?: AiChannel;
  environment?: Record<string, string | undefined>;
}): AiProfile {
  const text = normalized(message);
  const complex = hasVisual || message.length > 700 || COMPLEX_INTENT.test(text);
  const highStakes = HIGH_STAKES.test(text);
  const tier: AiTier = complex ? "complex" : "economy";

  const economy = environment.PRIME_AI_ECONOMY_MODEL?.trim() || "gpt-6-luna";
  const deep = environment.PRIME_AI_COMPLEX_MODEL?.trim() || "gpt-6.1-sol";
  const vision = environment.PRIME_AI_VISION_MODEL?.trim() || deep;

  return {
    model: hasVisual ? vision : complex ? deep : economy,
    tier,
    reasoningEffort: complex ? (highStakes ? "medium" : "low") : "none",
    maxOutputTokens: channel === "whatsapp"
      ? (complex ? 2500 : 1400)
      : (complex ? 5200 : 2800),
  };
}
