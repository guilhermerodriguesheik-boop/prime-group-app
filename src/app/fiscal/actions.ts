"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseAuthorizedNfeXml } from "@/lib/fiscal/nfe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FiscalImportState = { message: string; ok: boolean };
const fail = (message: string): FiscalImportState => ({ message, ok: false });
function parseFreight(value: string): number | null {
  const compact = value.trim().replace(/R\$/ig, "").replace(/\s/g, "");
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  const parsed = Number(normalized);
  return compact && Number.isFinite(parsed) && parsed > 0 && parsed < 1e9 ? Math.round(parsed * 100) / 100 : null;
}
export async function importFiscalNfe(_state: FiscalImportState, formData: FormData): Promise<FiscalImportState> {
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return fail("Entre na sua conta para importar o XML.");
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces").select("id").eq("kind", "prime").single();
    if (wsError || !workspace) return fail("Ambiente Prime Group nao encontrado.");

    const file = formData.get("xml");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xml")) {
      return fail("Selecione um XML de NF-e autorizado.");
    }
    if (file.size < 50 || file.size > 1024 * 1024) return fail("XML deve ter ate 1 MB.");
    const raw = await file.text();
    const parsed = parseAuthorizedNfeXml(raw);
    const ciot = String(formData.get("ciot") ?? "").replace(/\D/g, "");
    if (!/^\d{11,12}$/.test(ciot)) return fail("Informe o CIOT recebido da contratante (11 ou 12 digitos).");
    const freight = parseFreight(String(formData.get("freight") ?? ""));
    if (freight === null) return fail("Informe o valor contratado do frete, nao o valor da mercadoria.");

    // A tipagem SQL deve ser regenerada apos incorporar a migracao.
    const db = supabase as unknown as SupabaseClient;
    const { data: previous, error: previousError } = await db.from("fiscal_nfe_inbox")
      .select("id").eq("workspace_id", workspace.id).eq("access_key", parsed.accessKey).maybeSingle();
    if (previousError) return fail("Banco fiscal indisponivel. Confirme que a migracao foi aplicada.");
    let nfeId: string | undefined = previous?.id;
    if (!nfeId) {
      const { data: inserted, error } = await db.from("fiscal_nfe_inbox").insert({
        workspace_id: workspace.id, created_by: auth.user.id, source_kind: "manual",
        access_key: parsed.accessKey, invoice_number: parsed.invoiceNumber,
        invoice_series: parsed.invoiceSeries, issued_at: parsed.issuedAt,
        sender_name: parsed.senderName, sender_cnpj: parsed.senderCnpj,
        recipient_name: parsed.recipientName, recipient_cnpj: parsed.recipientCnpj,
        origin_city: parsed.originCity, origin_uf: parsed.originUf,
        destination_city: parsed.destinationCity, destination_uf: parsed.destinationUf,
        goods_value: parsed.goodsValue, gross_weight_kg: parsed.grossWeightKg,
        package_quantity: parsed.packageQuantity,
        cargo_reference: parsed.cargoReference, xml_content: raw,
      }).select("id").single();
      if (error) {
        if (error.code !== "23505") return fail("Erro ao guardar XML: " + error.message);
        const { data: existing } = await db.from("fiscal_nfe_inbox")
          .select("id").eq("workspace_id", workspace.id).eq("access_key", parsed.accessKey).single();
        nfeId = existing?.id;
      } else nfeId = inserted?.id;
    }
    if (!nfeId) return fail("Nao foi possivel localizar a NF-e recebida.");
    const { data: same, error: checkError } = await db.from("fiscal_drafts").select("id")
      .eq("workspace_id", workspace.id).eq("nfe_id", nfeId).eq("ciot", ciot)
      .eq("freight_value", freight).eq("document_type", "cte").eq("status", "draft").limit(1).maybeSingle();
    if (checkError) return fail("Falha ao conferir rascunhos existentes.");
    if (!same) {
      const { error: insertError } = await db.from("fiscal_drafts").insert({
        workspace_id: workspace.id, created_by: auth.user.id,
        document_type: "cte", nfe_id: nfeId,
        cargo_reference: parsed.cargoReference,
        ciot, freight_value: freight,
        status: "draft",
        checklist: {
          fiscal_approval: false,
          issue_environment: "none",
          invoice_signature_not_verified: true,
          note: "Rascunho sem validade fiscal. Conferir tomador, tributacao, RNTRC, percurso, placa e motorista.",
        },
      });
      if (insertError) return fail("Falha ao criar rascunho: " + insertError.message);
    }
    revalidatePath("/fiscal");
    return {ok:true,message:"NF-e importada. CT-e salvo apenas como RASCUNHO; nenhuma emissao fiscal realizada."};
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro inesperado na importacao.");
  }
}
