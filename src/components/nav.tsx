"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  ["▦", "Visão geral", "/"],
  ["✎", "Cadastros", "/cadastros"],
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

export function NavLinks() {
  const pathname = usePathname();

  return (
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
  );
}
