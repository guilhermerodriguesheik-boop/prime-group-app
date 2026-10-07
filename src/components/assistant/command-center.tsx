"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Workspace = {
  id: string;
  name: string;
  kind: string;
};

type ActionSummary = {
  type: string;
  label: string;
  status: "executed" | "reused";
};

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  files?: string[];
  actions?: ActionSummary[];
};

function documentType(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xml") || file.type.includes("xml")) return "xml";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "imagem";
  return "outro";
}

export function CommandCenter({
  workspaces,
  compact = false,
}: {
  workspaces: Workspace[];
  compact?: boolean;
}) {
  const primeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.kind === "prime") ?? workspaces[0],
    [workspaces],
  );

  const [workspaceId, setWorkspaceId] = useState(primeWorkspace?.id ?? "");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles() {
    if (!files.length) return [] as string[];

    const supabase = createClient();
    const ids: string[] = [];

    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error(`${file.name} excede 20 MB. Envie um arquivo menor.`);
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const storagePath = `${workspaceId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, {
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) throw uploadError;

      const { data: row, error: dbError } = await supabase
        .from("documents")
        .insert({
          workspace_id: workspaceId,
          filename: file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
          document_type: documentType(file),
          metadata: {
            source: "assistant_home",
          },
        })
        .select("id")
        .single();

      if (dbError) {
        await supabase.storage.from("documents").remove([storagePath]);
        throw dbError;
      }

      ids.push(row.id);
    }

    return ids;
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || (!message.trim() && files.length === 0) || !workspaceId) return;

    const clean = message.trim();
    const fileNames = files.map((file) => file.name);
    const userText = clean || "Analisar e registrar os arquivos enviados.";

    setBusy(true);
    setStatus(files.length ? "Enviando arquivos..." : "Analisando...");
    setChat((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: userText,
        files: fileNames,
      },
    ]);

    try {
      const documentIds = await uploadFiles();
      setStatus(documentIds.length ? "Lendo arquivos e executando..." : "Executando...");

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          workspaceId,
          conversationId: conversationId ?? undefined,
          documentIds,
        }),
      });

      const data = (await response.json()) as {
        answer?: string;
        error?: string;
        detail?: string;
        conversationId?: string | null;
        actions?: ActionSummary[];
      };

      if (!response.ok || !data.answer) {
        throw new Error([data.error, data.detail].filter(Boolean).join(" · ") || "A IA não respondeu.");
      }

      setConversationId(data.conversationId ?? null);
      setChat((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.answer ?? "Concluído.",
          actions: data.actions ?? [],
        },
      ]);
      setMessage("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus("");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Falha ao processar a solicitação.";
      setChat((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Não consegui concluir: ${text}`,
        },
      ]);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const combined = [...files, ...incoming].slice(0, 6);
    setFiles(combined);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <section className={`command-center ${compact ? "compact" : ""}`}>
      <div className="command-head">
        <div>
          <div className="command-kicker">IA OPERACIONAL</div>
          <h2>O que você quer fazer?</h2>
          <p>
            Digite um comando ou envie foto, PDF, XML ou CT-e. A IA pode analisar e registrar dados no Prime Finance.
          </p>
        </div>
        <select
          className="command-workspace"
          value={workspaceId}
          onChange={(event) => setWorkspaceId(event.target.value)}
          aria-label="Ambiente financeiro"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </div>

      {chat.length > 0 && (
        <div className="command-chat" aria-live="polite">
          {chat.map((item) => (
            <div key={item.id} className={`chat-bubble ${item.role}`}>
              <div className="chat-role">{item.role === "user" ? "Você" : "Prime IA"}</div>
              <div className="chat-text">{item.text}</div>
              {item.files?.length ? (
                <div className="chat-files">
                  {item.files.map((filename) => <span key={filename}>{filename}</span>)}
                </div>
              ) : null}
              {item.actions?.length ? (
                <div className="chat-actions">
                  {item.actions.map((action, index) => (
                    <span key={`${action.type}-${index}`} className="action-chip">
                      ✓ {action.label}{action.status === "reused" ? " · já existia" : ""}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={send} className="command-form">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ex.: Lança R$ 480 de diesel no VW 12.170 hoje e vincula à conta Itaú."
          rows={compact ? 3 : 4}
          maxLength={8000}
        />

        {files.length > 0 && (
          <div className="attachment-list">
            {files.map((file, index) => (
              <div className="attachment-chip" key={`${file.name}-${index}`}>
                <span>{file.name}</span>
                <button type="button" onClick={() => removeFile(index)} aria-label={`Remover ${file.name}`}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="command-footer">
          <div className="command-tools">
            <input
              ref={fileInputRef}
              className="file-input-hidden"
              type="file"
              multiple
              accept="image/*,.pdf,.xml,.txt,.csv,application/pdf,text/xml,application/xml"
              onChange={(event) => addFiles(event.target.files)}
            />
            <button
              className="button attach"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || files.length >= 6}
            >
              + Foto / PDF / XML
            </button>
            <span className="metric-foot">até 6 arquivos · 20 MB por arquivo</span>
          </div>

          <button
            className="button primary command-send"
            disabled={busy || (!message.trim() && files.length === 0)}
            type="submit"
          >
            {busy ? "Processando..." : "Enviar para a IA"}
          </button>
        </div>

        {status && <div className="command-status">{status}</div>}
      </form>

      <div className="command-hints">
        <button type="button" onClick={() => setMessage("Quais contas vencem nos próximos 30 dias?")}>
          Ver próximos vencimentos
        </button>
        <button type="button" onClick={() => setMessage("Compare o resultado dos meus veículos neste mês.")}>
          Comparar veículos
        </button>
        <button type="button" onClick={() => setMessage("Cadastre esse CT-e e crie a viagem com os dados do arquivo.")}>
          Cadastrar CT-e
        </button>
      </div>

      <div className="command-safety">
        Ações são registradas no histórico da IA. Baixas de contas e recebíveis só são feitas quando você pedir explicitamente.
      </div>
    </section>
  );
}
