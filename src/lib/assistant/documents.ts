import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type AssistantDocument = {
  id: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  documentType: string | null;
  extractedText: string;
  imageData: Uint8Array | null;
};

const MAX_TEXT_CHARS = 60000;
const MAX_PDF_PAGES = 40;

function decodeText(data: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(data);
}

async function extractPdfText(data: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let index = 1; index <= pageCount; index += 1) {
      const page = await pdf.getPage(index);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ");
      if (text.trim()) pages.push(`[Página ${index}] ${text.trim()}`);
      if (pages.join("\n").length >= MAX_TEXT_CHARS) break;
    }
  } finally {
    await pdf.destroy();
  }

  return pages.join("\n").slice(0, MAX_TEXT_CHARS);
}

export async function loadAssistantDocuments(
  supabase: SupabaseClient<Database>,
  documentIds: string[],
): Promise<AssistantDocument[]> {
  if (!documentIds.length) return [];

  const { data: rows, error } = await supabase
    .from("documents")
    .select("id,workspace_id,filename,storage_path,mime_type,document_type")
    .in("id", documentIds);

  if (error) throw error;

  const byId = new Map((rows ?? []).map((row) => [row.id, row]));
  const ordered = documentIds
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const result: AssistantDocument[] = [];

  for (const row of ordered) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(row.storage_path);

    if (downloadError || !blob) {
      result.push({
        id: row.id,
        workspaceId: row.workspace_id,
        filename: row.filename,
        mimeType: row.mime_type ?? "application/octet-stream",
        storagePath: row.storage_path,
        documentType: row.document_type,
        extractedText: "[Arquivo não pôde ser lido do armazenamento.]",
        imageData: null,
      });
      continue;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mimeType = row.mime_type ?? blob.type ?? "application/octet-stream";

    let extractedText = "";
    let imageData: Uint8Array | null = null;

    if (mimeType.startsWith("image/")) {
      imageData = bytes;
    } else if (mimeType === "application/pdf" || row.filename.toLowerCase().endsWith(".pdf")) {
      try {
        extractedText = await extractPdfText(bytes);
        if (!extractedText.trim()) {
          extractedText = "[PDF sem camada de texto detectável. Pode ser um PDF escaneado.]";
        }
      } catch {
        extractedText = "[Não foi possível extrair texto deste PDF.]";
      }
    } else if (
      mimeType.includes("xml") ||
      mimeType.startsWith("text/") ||
      /\.(xml|txt|csv|json)$/i.test(row.filename)
    ) {
      extractedText = decodeText(bytes).slice(0, MAX_TEXT_CHARS);
    } else {
      extractedText = "[Formato armazenado, mas sem extrator de texto configurado.]";
    }

    result.push({
      id: row.id,
      workspaceId: row.workspace_id,
      filename: row.filename,
      mimeType,
      storagePath: row.storage_path,
      documentType: row.document_type,
      extractedText,
      imageData,
    });
  }

  return result;
}
