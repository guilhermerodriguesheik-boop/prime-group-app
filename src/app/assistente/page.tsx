"use client";

import { FormEvent, useState } from "react";
import { Header } from "@/components/ui";

export default function Page() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function ask(event: FormEvent) {
    event.preventDefault();
    const clean = message.trim();
    if (!clean || loading) return;

    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          conversationId: conversationId ?? undefined,
        }),
      });

      const data = (await response.json()) as {
        answer?: string;
        error?: string;
        conversationId?: string | null;
      };

      if (!response.ok || !data.answer) {
        throw new Error(data.error || "Não foi possível consultar o assistente.");
      }

      setAnswer(data.answer);
      setConversationId(data.conversationId ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao consultar o assistente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header
        title="Assistente financeiro"
        subtitle="IA conectada aos dados reais do Prime Finance, respeitando cada ambiente."
      />

      <div className="card assistant-card">
        <form onSubmit={ask} className="assistant-form">
          <label htmlFor="assistant-message">Pergunte sobre seus dados</label>
          <textarea
            id="assistant-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ex.: Quanto tenho para receber nos próximos 30 dias?"
            rows={4}
            maxLength={8000}
          />
          <div className="assistant-actions">
            <span className="metric-foot">Consultas usam os dados disponíveis no Supabase.</span>
            <button className="button primary" disabled={loading || !message.trim()} type="submit">
              {loading ? "Analisando..." : "Perguntar"}
            </button>
          </div>
        </form>

        {error ? <div className="auth-message error">{error}</div> : null}
        {answer ? (
          <div className="assistant-answer">
            <div className="metric-label">Resposta</div>
            <div>{answer}</div>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h3>Exemplos</h3>
        <div className="grid grid-2">
          <button className="mini prompt-button" onClick={() => setMessage("Quanto tenho para receber nos próximos 30 dias?")}>
            “Quanto tenho para receber nos próximos 30 dias?”
          </button>
          <button className="mini prompt-button" onClick={() => setMessage("Quais são minhas contas em atraso?")}>
            “Quais são minhas contas em atraso?”
          </button>
          <button className="mini prompt-button" onClick={() => setMessage("Compare o resultado dos veículos.")}>
            “Compare o resultado dos veículos.”
          </button>
          <button className="mini prompt-button" onClick={() => setMessage("Resuma minha situação financeira atual.")}>
            “Resuma minha situação financeira atual.”
          </button>
        </div>
      </div>
    </>
  );
}
