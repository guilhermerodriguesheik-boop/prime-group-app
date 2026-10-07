"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function DocumentUploader({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [documentType, setDocumentType] = useState("comprovante");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size || !workspaceId) return;

    setBusy(true);
    setStatus("");

    try {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const storagePath = `${workspaceId}/${crypto.randomUUID()}-${safeName}`;

      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });

      if (storageError) throw storageError;

      const { error: dbError } = await supabase.from("documents").insert({
        workspace_id: workspaceId,
        filename: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        document_type: documentType,
      });

      if (dbError) {
        await supabase.storage.from("documents").remove([storagePath]);
        throw dbError;
      }

      setStatus("Documento enviado com sucesso. Atualize a página para vê-lo na lista.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha no envio.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={upload} className="card form-grid">
      <h3>Enviar documento</h3>
      <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} required>
        {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
      <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
        <option value="comprovante">Comprovante</option>
        <option value="nota_fiscal">Nota fiscal</option>
        <option value="xml">XML / CT-e</option>
        <option value="fatura">Fatura</option>
        <option value="contrato">Contrato</option>
        <option value="outro">Outro</option>
      </select>
      <input name="file" type="file" accept=".pdf,.xml,.jpg,.jpeg,.png,.webp,image/*,application/pdf,text/xml,application/xml" required />
      <button className="button primary" disabled={busy} type="submit">{busy ? "Enviando..." : "Enviar arquivo"}</button>
      {status && <div className="metric-foot">{status}</div>}
    </form>
  );
}
