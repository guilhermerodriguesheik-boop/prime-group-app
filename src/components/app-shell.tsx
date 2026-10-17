"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
import {
  ClipboardList,Landmark,LogOut,Menu,Moon,Percent,ShieldCheck,
  Sparkles,Sun,Truck,UserRound,X,Settings2
} from "lucide-react";

// Uma entrada por sistema. As telas especializadas continuam disponíveis
// dentro das áreas, sem lotar o menu lateral com links duplicados.
const sections=[
 {label:"Transporte",href:"/fiscal",icon:Truck,
  paths:["/fiscal","/prime","/frota","/motoristas","/viagens","/equipes"]},
 {label:"Empréstimos",href:"/juros",icon:Percent,paths:["/juros"]},
 {label:"Pessoal",href:"/pessoal",icon:UserRound,paths:["/pessoal"]},
 {label:"Bancos",href:"/bancos",icon:Landmark,paths:["/bancos"]},
 {label:"Financeiro",href:"/financeiro",icon:ClipboardList,
  paths:["/financeiro","/planejamento","/recorrentes","/contas","/relatorios"]},
] as const;

export function AppShell({children}:{children:React.ReactNode}){
 const pathname=usePathname();
 const [theme,setTheme]=useState<"light"|"dark">("light");
 const [menuOpen,setMenuOpen]=useState(false);
 const active=sections.find(s=>s.paths.some(p=>pathname===p||pathname.startsWith(p+"/")));
 useEffect(()=>{
  const preference=window.localStorage.getItem("prime-theme")==="dark"?"dark":"light";
  const tick=window.setTimeout(()=>{
   setTheme(preference);document.documentElement.dataset.theme=preference;
  },0);
  return ()=>window.clearTimeout(tick);
 },[]);
 function toggleTheme(){
  const next=theme==="light"?"dark":"light";setTheme(next);
  document.documentElement.dataset.theme=next;window.localStorage.setItem("prime-theme",next);
 }
 const themeButton=(className:string)=><button type="button" className={className}
  onClick={toggleTheme} title={theme==="light"?"Ativar modo escuro":"Ativar modo claro"}
  aria-label={theme==="light"?"Ativar modo escuro":"Ativar modo claro"}>
  {theme==="light"?<Moon size={17}/>:<Sun size={17}/>}
  <span>{theme==="light"?"Escuro":"Claro"}</span>
 </button>;
 if(pathname==="/login"||pathname.startsWith("/auth/")||pathname==="/empresa"||pathname.startsWith("/empresa/"))
  return <>{children}</>;
 return <div className="shell">
  <div className="mobile-appbar">
   <button type="button" className="icon-button" onClick={()=>setMenuOpen(!menuOpen)}
    aria-label={menuOpen?"Fechar menu":"Abrir menu"} aria-expanded={menuOpen}>
    {menuOpen?<X size={20}/>:<Menu size={20}/>}
   </button>
   <strong>Prime <span>Finance</span></strong>
   {themeButton("theme-button mobile-theme")}
  </div>
  {menuOpen&&<button type="button" aria-label="Fechar navegação" className="sidebar-overlay"
   onClick={()=>setMenuOpen(false)}/>}
  <aside className={"sidebar"+(menuOpen?" sidebar-open":"")}>
   <div className="brand"><div className="brand-mark">P</div>
    <div><strong>PRIME<span className="premium-brand-accent"> FINANCE</span></strong>
     <small>GESTÃO INTEGRADA</small></div>
   </div>
   <div className="sidebar-scroll">
    <nav className="nav" aria-label="Sistemas do Prime Finance"
     style={{display:"grid",gap:7,paddingTop:12}}>
     {sections.map(s=>{
      const Icon=s.icon,isActive=active?.href===s.href;
      return <Link key={s.href} href={s.href} onClick={()=>setMenuOpen(false)}
       className={isActive?"active":undefined} aria-current={isActive?"page":undefined}>
       <Icon size={18} strokeWidth={isActive?2.3:1.8}/>
       <span className="label">{s.label}</span>
      </Link>;
     })}
    </nav>
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
    <div className="toolbar-location"><span className="toolbar-dot"/> PRIME
     <span className="toolbar-separator">/</span> <strong>{active?.label||"Início"}</strong>
    </div>
    <div className="toolbar-actions">
     <Link href="/assistente" className={"toolbar-shortcut"+(pathname.startsWith("/assistente")?" selected":"")}>
      <Sparkles size={16}/> Assistente IA</Link>
     <Link href="/integracoes" className={"toolbar-shortcut"+(pathname.startsWith("/integracoes")?" selected":"")}>
      <Settings2 size={16}/> Integrações</Link>
     {themeButton("theme-button")}
    </div>
   </header>
   <main className="main">{children}</main>
  </div>
 </div>;
}
