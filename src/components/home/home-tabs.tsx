"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {LayoutDashboard,Sparkles,Wallet,Truck,CalendarClock,Zap} from "lucide-react";
type HomeTab="resumo"|"assistente"|"financas"|"frota"|"receber"|"acoes";
const groups=[
 {id:"resumo",label:"Resumo",description:"Indicadores e alertas",Icon:LayoutDashboard},
 {id:"assistente",label:"Assistente IA",description:"Perguntas e análises",Icon:Sparkles},
 {id:"financas",label:"Finanças",description:"Prime e pessoal",Icon:Wallet},
 {id:"frota",label:"Frota",description:"Resultado por veículo",Icon:Truck},
 {id:"receber",label:"Recebíveis",description:"Próximos pagamentos",Icon:CalendarClock},
 {id:"acoes",label:"Atalhos",description:"Ações e integrações",Icon:Zap},
] as const;
const Context=createContext<HomeTab>("resumo");
const byHash=(hash:string):HomeTab=>{
 const name=hash.replace(/^#(?:tab-)?/,"");
 return groups.some(x=>x.id===name)?name as HomeTab:"resumo";
};
export function HomeTabs({children}:{children:ReactNode}){
 const [active,setActive]=useState<HomeTab>("resumo");
 useEffect(()=>{
  const sync=()=>setActive(byHash(window.location.hash));
  sync();window.addEventListener("hashchange",sync);
  return ()=>window.removeEventListener("hashchange",sync);
 },[]);
 return <Context.Provider value={active}>
  <nav role="tablist" className="home-module-tabs" aria-label="Áreas do Prime Finance">
   {groups.map(({id,label,description,Icon})=><button type="button" key={id} role="tab"
    aria-selected={active===id} className={"home-module-tab"+(active===id?" is-active":"")}
    onClick={()=>{setActive(id);window.history.replaceState(null,"","#tab-"+id)}}>
    <Icon size={18} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span>
   </button>)}
  </nav>
  <div className="home-module-body">{children}</div>
 </Context.Provider>;
}
export function HomeTabPanel({tab,children}:{tab:HomeTab;children:ReactNode}){
 const active=useContext(Context);
 if(active!==tab)return null;
 return <div role="region" aria-label={groups.find(x=>x.id===tab)?.label} className="home-module-panel">{children}</div>;
}
