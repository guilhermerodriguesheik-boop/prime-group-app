import { Suspense } from "react";
import { Cadastros } from "@/components/ledger/cadastros";
import { Header } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<Header title="Cadastros" subtitle="Veículos, despesas, receitas e contas, cada um no seu ambiente." />}>
      <Cadastros />
    </Suspense>
  );
}
