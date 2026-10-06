import Link from "next/link";
import { Header, Metric, SectionTitle } from "@/components/ui";

export default function Page() {
  return (
    <>
      <Header title="Recebíveis e juros" subtitle="Acordos separados da empresa e do pessoal." />
      <div className="quick">
        <Link href="/cadastros?parte=receitas">Cadastrar juros recebidos</Link>
        <Link href="/cadastros?parte=despesas">Cadastrar custo do acordo</Link>
      </div>
      <div className="grid grid-4">
        <Metric label="Capital em aberto" value="R$ 80.000" />
        <Metric label="Juros previstos" value="R$ 14.000" tone="positive" />
        <Metric label="A receber · 30 dias" value="R$ 24.000" />
        <Metric label="Em atraso" value="R$ 0" />
      </div>
      <SectionTitle title="Contratos e acordos" />
      <div className="notice">Juros recebidos e custos do acordo entram pelo cadastro, no ambiente Recebíveis / Juros. O capital do contrato continua separado da despesa da Prime e do pessoal.</div>
    </>
  );
}