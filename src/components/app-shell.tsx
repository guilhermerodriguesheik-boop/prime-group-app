import { NavLinks } from "@/components/nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">P</div><div><strong>Prime Finance</strong><small>gestão inteligente</small></div></div>
        <div className="nav-section">Principal</div>
        <NavLinks />
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
