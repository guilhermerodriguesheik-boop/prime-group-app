import { CommandCenter } from "@/components/assistant/command-center";
import { Header } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id,name,kind")
    .order("kind");

  return (
    <>
      <Header
        title="Assistente financeiro"
        subtitle="Converse, envie documentos e peça para a IA executar lançamentos no Prime Finance."
      />
      <CommandCenter workspaces={workspaces ?? []} />
    </>
  );
}
