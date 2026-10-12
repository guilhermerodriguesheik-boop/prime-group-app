import Link from "next/link";
import { Header, SectionTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const envLabels: Record<string,string> = {
  prime: "Prime Group",
  personal: "Pessoal",
  interest: "Empréstimos / Juros",
};
const kindLabels: Record<string,string> = {
  expense: "Despesa",
  income: "Recebimento",
  payable: "Conta a pagar",
  receivable: "Conta a receber",
  loan: "Empréstimo",
  trip: "Frete / viagem",
  other: "Anotação",
};

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Faça login para ver seus registros.");

  const [recordResult, workspaceResult] = await Promise.all([
    supabase.from("partial_records")
      .select("id,workspace_id,subject,original_text,record_kind,extracted_data,created_at")
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("workspaces").select("id,name,kind"),
  ]);
  if (recordResult.error || workspaceResult.error) {
    throw recordResult.error ?? workspaceResult.error ?? new Error("Falha ao buscar registros.");
  }
  const workspaces = new Map((workspaceResult.data ?? []).map((w) => [w.id, w]));
  const records = recordResult.data ?? [];
  return (
    <>
      <Header title="Registros parciais" subtitle="Informações que você pediu para guardar sem exigir todos os campos." />
      <div className="notice">
        Estes registros foram salvos, mas não afetam caixa, receitas, despesas, contas a pagar ou juros.
        Quando você fornecer informações adicionais, peça à IA para transformar a anotação em um lançamento apropriado.
        Fretes com dados suficientes são cadastrados diretamente em <Link href="/viagens">Viagens</Link>.
      </div>
      <SectionTitle title="Informações guardadas" hint={records.length + " anotações abertas"} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Registrado em</th><th>Assunto</th><th>Ambiente</th><th>Informação informada</th><th>Tipo</th></tr></thead>
          <tbody>
            {records.map((record) => {
              const ws = record.workspace_id ? workspaces.get(record.workspace_id) : null;
              return (
                <tr key={record.id}>
                  <td>{new Intl.DateTimeFormat("pt-BR", { timeZone:"America/Sao_Paulo", dateStyle:"short" }).format(new Date(record.created_at))}</td>
                  <td>{record.subject}</td>
                  <td>{ws ? (envLabels[ws.kind] ?? ws.name) : "Ainda não classificado"}</td>
                  <td style={{ maxWidth: 420, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{record.original_text}</td>
                  <td>{kindLabels[record.record_kind] ?? record.record_kind}</td>
                </tr>
              );
            })}
            {records.length === 0 && <tr><td colSpan={5}>Nenhuma anotação pendente. Seus fretes estão na seção Viagens.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="quick" style={{ marginTop: 18 }}>
        <Link href="/assistente">Conversar com a IA para complementar informações</Link>
      </div>
    </>
  );
}
