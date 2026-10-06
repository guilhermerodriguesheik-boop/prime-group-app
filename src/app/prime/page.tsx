import Link from "next/link";
import { WorkspaceBoard } from "@/components/ledger/workspace-board";
import { Header } from "@/components/ui";

export default function Page() {
  return (
    <>
      <Header title="Prime Group" subtitle="Financeiro e operação da transportadora." />
      <div className="quick">
        <Link href="/cadastros?parte=receitas">Cadastrar receita</Link>
        <Link href="/cadastros?parte=despesas">Cadastrar despesa</Link>
        <Link href="/cadastros?parte=veiculos">Cadastrar veículo</Link>
      </div>
      <WorkspaceBoard workspace="Prime" />
    </>
  );
}
