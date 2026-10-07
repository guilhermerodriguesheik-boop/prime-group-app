"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  ["▦", "Visão geral", "/"],
  ["＋", "Cadastros", "/cadastros"],
  ["▤", "Prime", "/prime"],
  ["⌂", "Pessoal", "/pessoal"],
  ["%", "Juros", "/juros"],
  ["▣", "Contas", "/contas"],
  ["◴", "Planejamento", "/planejamento"],
  ["▥", "Relatórios", "/relatorios"],
  ["↔", "Viagens", "/viagens"],
  ["▰", "Frota", "/frota"],
  ["▱", "Documentos", "/documentos"],
  ["✦", "Assistente", "/assistente"],
  ["⚙", "Integrações", "/integracoes"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login" || pathname.startsWith("/auth/")) {
    return <>{children}</>;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <strong>Prime Finance</strong>
            <small>gestão inteligente</small>
          </div>
        </div>
        <div className="nav-section">Principal</div>
        <nav className="nav">
          {nav.map(([icon, label, href]) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={active ? "active" : undefined}>
                <span>{icon}</span> <span className="label">{label}</span>
              </Link>
            );
          })}
        </nav>
        <form action="/auth/signout" method="post" className="sidebar-footer">
          <button className="button ghost" type="submit">Sair</button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
