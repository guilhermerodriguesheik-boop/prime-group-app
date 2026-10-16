import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readDotCompany } from "@/lib/fiscal/dotcompany-insights";

/** Tools available only inside the Prime Finance AI assistant, never publicly. */
export function createDotCompanyAssistantTools(input: {
  db: SupabaseClient;
  userId: string;
  primeWorkspaceId: string | null;
}) {
  return {
    consultar_dotcompany: tool({
      description: "Consulta fiscal SOMENTE LEITURA na DotCompany da Prime Group. Para verificar CT-e/MDF-e, histórico, saldo da API ou o erro da carga 029988. Nunca emite, cancela, encerra, altera numeração nem desbloqueia transmissões. Resultados de listagem não comprovam que uma tentativa indeterminada foi rejeitada; sempre explique isso.",
      inputSchema: z.object({
        consulta: z.enum(["cte", "mdfe", "mdfe_pending", "usage", "emitters"]),
        carga: z.string().regex(/^\d{1,12}$/).optional()
          .describe("Referência da carga, por exemplo 029988, somente ao consultar CT-e."),
      }),
      execute: async ({ consulta, carga }) => {
        if (!input.primeWorkspaceId)
          return { ok: false, error: "Ambiente Prime não encontrado." };
        const { data: ws } = await input.db.from("workspaces").select("id")
          .eq("id", input.primeWorkspaceId).eq("owner_id", input.userId)
          .eq("kind", "prime").maybeSingle();
        if (!ws) return { ok: false, error: "Somente o proprietário pode consultar a DotCompany." };
        const result = await readDotCompany(consulta);
        let local: Record<string, unknown> | null = null;
        if (carga && consulta === "cte") {
          const { data: draft } = await input.db.from("fiscal_drafts")
            .select("id,status,cargo_reference").eq("workspace_id", ws.id)
            .eq("document_type", "cte").eq("cargo_reference", carga).maybeSingle();
          if (draft) {
            const { data: attempt } = await input.db.from("fiscal_cte_transmissions")
              .select("status,error_code,created_at,access_key,protocol,idempotency_key")
              .eq("workspace_id", ws.id).eq("draft_id", draft.id).maybeSingle();
            local = { cargo: draft.cargo_reference, draftStatus: draft.status, attempt: attempt || null };
          }
        }
        return {
          source: "DotCompany (consulta sem emissão)",
          operation: consulta, provider: result, local,
          reconciled: false,
          caution: "A ausência na lista da DotCompany NÃO comprova rejeição ou inexistência de CT-e. Não remova bloqueio, não tente nova emissão e não declare autorização sem chave e protocolo comprovados.",
        };
      },
    }),
  };
}
