import { CheckCircle2, CircleDashed, ShieldAlert } from "lucide-react";
import type { FiscalStep } from "@/lib/fiscal/readiness";
export function FiscalReadinessPanel({steps}:{steps:FiscalStep[]}){
 const done=steps.filter(s=>s.state==="done").length;
 return <div className="fiscal-readiness-panel">
  <div className="fiscal-readiness-head">
   <div><strong>Preparação para emissão</strong><p>Dados reais, sem considerar credenciais ou documentos como homologados antes dos testes.</p></div>
   <span>{done} de {steps.length} verificações</span>
  </div>
  <div className="fiscal-readiness-progress" aria-hidden="true"><span style={{width:(100*done/Math.max(1,steps.length))+"%"}}/></div>
  <div className="fiscal-readiness-items">{steps.map(item=><div className="fiscal-readiness-item" key={item.id}>
   <span className={"fiscal-readiness-icon "+item.state}>{item.state==="done"?<CheckCircle2 size={18}/>:item.state==="blocked"?<ShieldAlert size={18}/>:<CircleDashed size={18}/>}</span>
   <div><strong>{item.label}</strong><p>{item.description}</p></div>
  </div>)}</div>
 </div>;
}
