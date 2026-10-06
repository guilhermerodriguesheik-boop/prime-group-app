import Link from "next/link";
import { WorkspaceBoard } from "@/components/ledger/workspace-board";
import { Header } from "@/components/ui";

export default function Page() {
  return (
    <>
      <Header title="Pessoal" subtitle="Seu dinheiro separado da Prime." />
      <div className="quick">
        <Link href="/cadastros?parte=despesas">Cadastrar despesa</Link>
        <Link href="/cadastros?parte=receitas">Cadastrar receita</Link>
        <Link href="/cadastros?parte=contas">Cadastrar conta</Link>
      </div>
      <WorkspaceBoard workspace="Pessoal" />
    </>
  );
}
