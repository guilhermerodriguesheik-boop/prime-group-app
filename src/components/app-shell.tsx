import Link from "next/link";

const nav = [
  ["▦", "Visão geral", "/"],
  ["▤", "Prime", "/prime"],
  ["⌂", "Pessoal", "/pessoal"],
  ["%", "Juros", "/juros"],
  ["▣", "Contas", "/contas"],
  ["↔", "Viagens", "/viagens"],
  ["▰", "Frota", "/frota"],
  ["▱", "Documentos", "/documentos"],
  ["✦", "Assistente", "/assistente"],
  ["⚙", "Integrações", "/integracoes"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">P</div><div><strong>Prime Finance</strong><small>gestão inteligente</small></div></div>
        <div className="nav-section">Principal</div>
        <nav className="nav">
          {nav.map(([icon,label,href]) => <Link key={href} href={href}><span>{icon}</span> <span className="label">{label}</span></Link>)}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
