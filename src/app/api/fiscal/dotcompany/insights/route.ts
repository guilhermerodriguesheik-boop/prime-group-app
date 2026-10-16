import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readDotCompany, type DotCompanyReadOperation } from "@/lib/fiscal/dotcompany-insights";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;
const allowed = new Set<DotCompanyReadOperation>(["usage", "emitters", "cte", "mdfe", "mdfe_pending"]);
export async function GET(req: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Faça login no Prime Finance." }, { status: 401 });
  const { data: ws } = await client.from("workspaces").select("id")
    .eq("kind", "prime").eq("owner_id", user.id).maybeSingle();
  if (!ws) return NextResponse.json({ error: "Apenas o proprietário da Prime pode consultar a API fiscal." }, { status: 403 });
  const query = new URL(req.url).searchParams;
  const kind = query.get("kind") || "cte";
  if (!allowed.has(kind as DotCompanyReadOperation))
    return NextResponse.json({ error: "Tipo de consulta inválido." }, { status: 400 });
  const cargo = (query.get("cargo") || "").trim();
  if (cargo && !/^\d{1,12}$/.test(cargo))
    return NextResponse.json({ error: "Código da carga inválido." }, { status: 400 });
  const db = client as unknown as SupabaseClient;
  let local: Array<Record<string, unknown>> = [];
  if (cargo) {
    const { data: drafts, error } = await db.from("fiscal_drafts")
      .select("id,status,cargo_reference").eq("workspace_id", ws.id)
      .eq("document_type", "cte").eq("cargo_reference", cargo).limit(3);
    if (error) return NextResponse.json({ error: "Falha ao consultar cargas." }, { status: 503 });
    if (drafts?.length) {
      const { data: attempts } = await db.from("fiscal_cte_transmissions")
        .select("draft_id,status,error_code,created_at,access_key,protocol,idempotency_key")
        .eq("workspace_id", ws.id).in("draft_id", drafts.map(d => d.id));
      local = drafts.map(d => ({
        cargo: d.cargo_reference, draftStatus: d.status,
        attempt: attempts?.find(t => t.draft_id === d.id) || null,
      }));
    }
  }
  const provider = await readDotCompany(kind as DotCompanyReadOperation);
  return NextResponse.json({
    kind, cargo: cargo || null, local, provider,
    reconciled: false,
    warning: "Consulta somente leitura. Um resultado inconclusivo nunca é desbloqueado automaticamente. A listagem da DotCompany pode não identificar tentativas rejeitadas antes da criação do documento.",
  }, { headers: { "Cache-Control": "no-store" } });
}
