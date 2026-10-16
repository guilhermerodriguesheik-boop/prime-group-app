"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {ClipboardCheck,Inbox,Truck,Wallet,PlugZap,Sparkles} from "lucide-react";
type Tab="cte"|"cargas"|"mdfe"|"financeiro"|"integracoes"|"ia";
const options=[
 {id:"cte",label:"CT-e / Emissão",description:"Preparar e revisar cargas",Icon:ClipboardCheck},
 {id:"cargas",label:"Caixa de entrada",description:"E-mails, NF-e e XML",Icon:Inbox},
 {id:"mdfe",label:"MDF-e",description:"Manifestos e viagens",Icon:Truck},
 {id:"financeiro",label:"Faturamento",description:"Ortobom e recebimentos",Icon:Wallet},
 {id:"integracoes",label:"SEFAZ e ajustes",description:"DotCompany, ANTT e cadastros",Icon:PlugZap},
 {id:"ia",label:"Assistente fiscal",description:"Conferir com IA",Icon:Sparkles},
] as const satisfies ReadonlyArray<{id:Tab;label:string;description:string;Icon:typeof ClipboardCheck}>;
const Context=createContext<Tab>("cte");
function tabForHash(hash:string):Tab{
 const h=hash.replace(/^#/,"");
 if(["module-cargas","gmail-integration","manual-import"].includes(h))return "cargas";
 if(["module-cte","cte-queue"].includes(h))return "cte";
 if(["module-mdfe","mdfe-manifest"].includes(h))return "mdfe";
 if(["module-financeiro","ortobom-finance"].includes(h))return "financeiro";
 if(["module-integracoes","fiscal-provider"].includes(h))return "integracoes";
 if(["module-ia","fiscal-assistant"].includes(h))return "ia";
 return "cte";
}
export function FiscalTabs({children}:{children:ReactNode}){
 const [active,setActive]=useState<Tab>("cte");
 useEffect(()=>{
  const sync=()=>setActive(tabForHash(window.location.hash));
  sync();
  window.addEventListener("hashchange",sync);
  return ()=>window.removeEventListener("hashchange",sync);
 },[]);
 function choose(tab:Tab){
  setActive(tab);
  window.history.replaceState(null,"","#module-"+tab);
 }
 return <Context.Provider value={active}>
  <nav className="fiscal-module-tabs" role="tablist" aria-label="Áreas do emissor fiscal">
   {options.map(o=>{
    const Icon=o.Icon;
    return <button key={o.id} role="tab" type="button" id={"tab-"+o.id}
     aria-selected={active===o.id} aria-controls={"panel-"+o.id}
     className={"fiscal-module-tab"+(active===o.id?" is-active":"")}
     onClick={()=>choose(o.id)}>
      <Icon size={18} aria-hidden="true"/><span><strong>{o.label}</strong><small>{o.description}</small></span>
    </button>;
   })}
  </nav>
  <div className="fiscal-active-module">{children}</div>
 </Context.Provider>;
}
export function FiscalTabPanel({tab,children}:{tab:Tab;children:ReactNode}){
 const active=useContext(Context);
 if(active!==tab)return null;
 // Extra parts of the same module may each render a role=region.
 return <div className="fiscal-tab-content" role="region" aria-label={options.find(x=>x.id===tab)?.label}>
  {children}
 </div>;
}
