"use client";

import { FormEvent, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { AudioControls } from "./audio-controls";

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


// Document files must be placed in an identified environment before uploading.
// The chat itself never preselects a workspace for the financial actions.
function attachmentWorkspace(workspaces: Workspace[], message: string, fileNames: string[]) {
  const text = [message, ...fileNames].join(" ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const markers: Record<string, RegExp> = {
    prime: /\b(prime( group)?|empresa|empresarial|frete|frota|caminhao|sprinter|worker|ortobom|motorista|pedagio|diesel|ct-?e|combustivel do caminhao)\b/,
    personal: /\b(pessoal|pessoais|casa|familia|supermercado|mercado|ifood|carrefour|academia|plano de saude|escola|despesa domestica)\b/,
    interest: /\b(emprestimo|emprestimos|emprestei|juros|devedor|devedores|capital emprestado|cobranca de juros)\b/,
  };
  const matches = Object.entries(markers)
    .filter(([, regex]) => regex.test(text))
    .map(([kind]) => kind);
  if (matches.length !== 1) return null;
  return workspaces.find((workspace) => workspace.kind === matches[0]) ?? null;
}

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
  const sendingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(attachments: File[], workspaceId: string) {
    if (!attachments.length) return [] as string[];

    const supabase = createClient();
    const ids: string[] = [];

    for (const file of attachments) {
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
    if (sendingRef.current || audioBusy || (!message.trim() && files.length === 0)) return;

    const clean = message.trim();
    const selectedFiles = [...files];
    const fileNames = selectedFiles.map((file) => file.name);
    const userText = clean || "Analisar os arquivos enviados.";

    // If the file's context is unknown, keep it local and ask rather than
    // silently storing a personal file inside the business environment.
    const fileWorkspace = selectedFiles.length
      ? attachmentWorkspace(workspaces, clean, fileNames)
      : null;
    if (selectedFiles.length && !fileWorkspace) {
      // Keep the draft and attached files so the user can add context once.
      setStatus("Para classificar o anexo, escreva na mensagem se é da Prime Group, Pessoal ou Empréstimos/Juros. Nenhum lançamento foi feito.");
      return;
    }

    sendingRef.current = true;
    setBusy(true);
    setStatus(selectedFiles.length ? "Enviando arquivos..." : "Analisando...");
    setChat((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: userText,
        files: fileNames,
      },
    ]);

    // Clear immediately, not after waiting for the AI response.
    // In particular, don't delete a new draft typed during the request.
    setMessage("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      const documentIds = fileWorkspace
        ? await uploadFiles(selectedFiles, fileWorkspace.id)
        : [];
      setStatus(documentIds.length ? "Lendo arquivos e executando..." : "Executando...");

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
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
      setStatus("");
    } catch (error) {
      setMessage((current) => current.trim() ? current : clean);
      const errorText = error instanceof Error ? error.message : "Falha ao processar a solicitação.";
      setChat((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Não consegui concluir: ${errorText}. Você pode reenviar a mensagem.`,
        },
      ]);
      setStatus("");
    } finally {
      sendingRef.current = false;
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
            Digite, grave um áudio ou envie nota fiscal (foto, PDF ou XML). A IA interpreta e pergunta se houver dúvida.
          </p>
        </div>

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
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ex.: abasteci 970 no 12.170 dia 7"
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
            <span className="metric-foot">até 6 documentos · 20 MB por arquivo</span>
            <AudioControls
              disabled={busy}
              onTranscript={(text) => setMessage((current) =>
                current.trim() ? current.trim() + "\n" + text : text
              )}
              onStatus={setStatus}
              onBusyChange={setAudioBusy}
            />
          </div>

          <button
            className="button primary command-send"
            disabled={busy || audioBusy || (!message.trim() && files.length === 0)}
            type="submit"
          >
            {busy ? "Processando..." : "Enviar"}
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
        Ao gravar áudio, confira a transcrição antes de enviar. Se não estiver claro onde classificar uma nota fiscal, indique Prime Group, Pessoal ou Juros.
      </div>
    </section>
  );
}
