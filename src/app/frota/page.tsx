import Link from "next/link";
import { FleetCards } from "@/components/ledger/fleet-table";
import { Header, SectionTitle } from "@/components/ui";

export default function Page() {
  return (
    <>
      <Header title="Frota" subtitle="Rentabilidade, combustível e custo por veículo." />
      <div className="quick">
        <Link href="/cadastros?parte=veiculos">Cadastrar veículo</Link>
        <Link href="/cadastros?parte=despesas">Lançar despesa da frota</Link>
        <Link href="/cadastros?parte=receitas">Lançar receita da frota</Link>
      </div>
      <SectionTitle title="Indicadores" />
      <FleetCards />
    </>
  );
}
