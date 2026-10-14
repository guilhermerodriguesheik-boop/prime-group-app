"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Building2, CalendarDays, CreditCard, FileText, Landmark,
  LayoutDashboard, LogOut, Menu, Moon, Percent, Settings2, ShieldCheck,
  Sparkles, Sun, Truck, UserRound, Wallet, X, ClipboardList, Route,
} from "lucide-react";

const nav = [
  {label:"Principal",items:[
    {label:"Visão geral",href:"/",icon:LayoutDashboard},
    {label:"Bancos e extratos",href:"/bancos",icon:Landmark},
    {label:"Contas e cartões",href:"/contas",icon:CreditCard},
    {label:"Prime Group",href:"/prime",icon:Building2},
    {label:"Finanças pessoais",href:"/pessoal",icon:UserRound},
  ]},
  {label:"Gestão",items:[
    {label:"Planejamento",href:"/planejamento",icon:CalendarDays},
    {label:"Relatórios",href:"/relatorios",icon:BarChart3},
    {label:"Empréstimos e juros",href:"/juros",icon:Percent},
    {label:"Viagens e fretes",href:"/viagens",icon:Route},
    {label:"Frota",href:"/frota",icon:Truck},
  ]},
  {label:"Ferramentas",items:[
    {label:"Assistente IA",href:"/assistente",icon:Sparkles},
    {label:"Cadastros",href:"/cadastros",icon:Wallet},
    {label:"Documentos",href:"/documentos",icon:FileText},
    {label:"Registros parciais",href:"/registros",icon:ClipboardList},
    {label:"Integrações",href:"/integracoes",icon:Settings2},
  ]},
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname=usePathname();
  const [theme,setTheme]=useState<"light"|"dark">("light");
  const [menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>{
    const saved=window.localStorage.getItem("prime-theme");
    const preference=saved==="dark"?"dark":"light";
    const tick=window.setTimeout(()=>{
      setTheme(preference);
      document.documentElement.dataset.theme=preference;
    },0);
    return ()=>window.clearTimeout(tick);
  },[]);
  function toggleTheme(){
    const next=theme==="light"?"dark":"light";
    setTheme(next);
    document.documentElement.dataset.theme=next;
    window.localStorage.setItem("prime-theme",next);
  }
  const themeButton=(className:string)=>(
    <button type="button" className={className} onClick={toggleTheme}
      title={theme==="light"?"Ativar modo escuro":"Ativar modo claro"}
      aria-label={theme==="light"?"Ativar modo escuro":"Ativar modo claro"}>
      {theme==="light"?<Moon size={17}/>:<Sun size={17}/>}
      <span>{theme==="light"?"Escuro":"Claro"}</span>
    </button>
  );
  if (pathname==="/login" || pathname.startsWith("/auth/") || pathname==="/empresa" || pathname.startsWith("/empresa/")) {
    return <>{children}</>;
  }
  let currentLabel="Prime Finance";
  for(const group of nav){
    for(const item of group.items){
      const active=item.href==="/"?pathname==="/":pathname.startsWith(item.href);
      if(active){currentLabel=item.label;break;}
    }
  }
  return (
    <div className="shell">
      <div className="mobile-appbar">
        <button type="button" className="icon-button" onClick={()=>setMenuOpen(!menuOpen)}
          aria-label={menuOpen?"Fechar menu":"Abrir menu"} aria-expanded={menuOpen}>
          {menuOpen?<X size={20}/>:<Menu size={20}/>}
        </button>
        <strong>Prime <span>Finance</span></strong>
        {themeButton("theme-button mobile-theme")}
      </div>
      {menuOpen&&<button type="button" aria-label="Fechar navegação" className="sidebar-overlay" onClick={()=>setMenuOpen(false)}/>}
      <aside className={"sidebar"+(menuOpen?" sidebar-open":"")}>
        <div className="brand">
          <div className="brand-mark">P</div>
          <div><strong>Prime Finance</strong><small>Gestão inteligente</small></div>
        </div>
        <div className="sidebar-scroll">
          {nav.map(group=>(
            <div key={group.label}>
              <div className="nav-section">{group.label}</div>
              <nav className="nav" aria-label={group.label}>
                {group.items.map(item=>{
                  const Icon=item.icon;
                  const active=item.href==="/"?pathname==="/":pathname.startsWith(item.href);
                  return <Link key={item.href} href={item.href} onClick={()=>setMenuOpen(false)} className={active?"active":undefined} aria-current={active?"page":undefined}>
                    <Icon size={17} strokeWidth={active?2.25:1.8}/>
                    <span className="label">{item.label}</span>
                  </Link>;
                })}
              </nav>
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-private"><ShieldCheck size={15}/> Ambiente privado</div>
          <form action="/auth/signout" method="post" className="sidebar-footer">
            <button className="button ghost" type="submit"><LogOut size={16}/> <span>Sair da conta</span></button>
          </form>
        </div>
      </aside>
      <div className="shell-content">
        <header className="app-toolbar">
          <div className="toolbar-location"><span className="toolbar-dot"/> Painel financeiro <span className="toolbar-separator">/</span> <strong>{currentLabel}</strong></div>
          <div className="toolbar-actions">{themeButton("theme-button")}</div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
