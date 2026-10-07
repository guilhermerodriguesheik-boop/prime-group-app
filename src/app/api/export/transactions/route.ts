import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return '"' + text + '"';
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const [{ data: transactions, error }, { data: workspaces }] = await Promise.all([
    supabase.from("transactions").select("id,workspace_id,type,amount,occurred_at,due_date,description,status,source").order("occurred_at", { ascending: false }).limit(5000),
    supabase.from("workspaces").select("id,name"),
  ]);

  if (error) return new Response("Falha ao exportar", { status: 500 });

  const workspaceMap = new Map((workspaces ?? []).map((item) => [item.id, item.name]));
  const header = ["data","ambiente","tipo","descricao","valor","status","origem"];
  const rows = (transactions ?? []).map((item) => [
    item.occurred_at,
    workspaceMap.get(item.workspace_id) ?? "",
    item.type,
    item.description,
    Number(item.amount).toFixed(2).replace(".", ","),
    item.status,
    item.source,
  ]);

  const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="prime-finance-lancamentos-' + date + '.csv"',
      "Cache-Control": "no-store",
    },
  });
}
