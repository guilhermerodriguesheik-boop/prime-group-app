import type { Metadata } from "next";
import Link from "next/link";
import "./empresa.css";

const companyUrl = "https://prime-finance-ochre.vercel.app/empresa";

export const metadata: Metadata = {
  title: { default: "Prime Group | Transportes e Logística", template: "%s | Prime Group" },
  description: "Prime Group Representações e Logística Ltda. Serviços de transporte rodoviário de cargas, coleta, distribuição e soluções de frete no Rio de Janeiro.",
  alternates: { canonical: companyUrl },
  openGraph: {
    title: "Prime Group | Transportes e Logística",
    description: "Logística e transporte rodoviário de cargas. Base em Duque de Caxias, Rio de Janeiro.",
    url: companyUrl,
    siteName: "Prime Group",
    type: "website",
    locale: "pt_BR",
  },
};

export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pg-site">
      <div className="pg-topbar">
        <div className="pg-container pg-topbar-inner">
          <Link href="/empresa" className="pg-logo" aria-label="Prime Group - página inicial">
            <span className="pg-logo-mark">P</span>
            <span className="pg-logo-copy">
              <strong>PRIME GROUP</strong>
              <small>Transportes &amp; Logística</small>
            </span>
          </Link>
          <nav className="pg-menu" aria-label="Menu institucional">
            <Link href="/empresa#sobre">Sobre</Link>
            <Link href="/empresa#servicos">Serviços</Link>
            <Link href="/empresa#contato" className="pg-nav-cta">Contato</Link>
          </nav>
        </div>
      </div>
      {children}
      <footer className="pg-footer">
        <div className="pg-container pg-footer-columns">
          <div>
            <strong>Prime Group Representações e Logística Ltda.</strong>
            <p>Duque de Caxias · Rio de Janeiro · Brasil</p>
            <p>CNPJ 42.361.401/0001-17</p>
          </div>
          <div className="pg-footer-links">
            <Link href="/empresa">Início</Link>
            <Link href="/empresa/privacidade">Privacidade</Link>
            <Link href="/empresa/exclusao-de-dados">Solicitar exclusão de dados</Link>
          </div>
        </div>
        <div className="pg-container pg-footer-bottom">
          <span>© {new Date().getFullYear()} Prime Group. Todos os direitos reservados.</span>
          <span>Informações institucionais · Sem acesso público a dados financeiros</span>
        </div>
      </footer>
    </div>
  );
}
