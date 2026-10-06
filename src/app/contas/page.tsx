import Link from "next/link";
import { AccountsBoard } from "@/components/ledger/workspace-board";
import { Header } from "@/components/ui";

export default function Page() {
  return (
    <>
      <Header title="Contas e cartões" subtitle="Bancos, cartões, faturas e conciliação." />
      <div className="quick">
        <Link href="/cadastros?parte=contas">Cadastrar conta</Link>
        <Link href="/cadastros?parte=despesas">Registrar pagamento ou transferência</Link>
      </div>
      <AccountsBoard />
    </>
  );
}
