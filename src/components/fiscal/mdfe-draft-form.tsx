"use client";
import { useActionState } from "react";
import { createMdfePreparation, type FiscalImportState } from "@/app/fiscal/actions";
export type CteDraftChoice={id:string;label:string};
const initial: FiscalImportState={ok:false,message:""};
export function MdfeDraftForm({cteDrafts}:{cteDrafts:CteDraftChoice[]}){
 const [state,action,pending]=useActionState(createMdfePreparation,initial);
 return <form action={action} className="card" style={{display:"grid",gap:12,maxWidth:740}}>
  <h3>Preparar MDF-e para a viagem</h3>
  <p>Vincula um manifesto ao rascunho CT-e. Não autoriza, numera, assina ou transmite documentos.</p>
  <label>CT-e de referência
    <select name="cteDraftId" required disabled={!cteDrafts.length} defaultValue="" style={{display:"block",width:"100%",padding:10}}>
      <option value="" disabled>Selecione a carga</option>
      {cteDrafts.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
    </select>
  </label>
  <label>Placa do veículo
    <input name="plate" required maxLength={9} autoCapitalize="characters" placeholder="ABC1D23" />
  </label>
  <label>RNTRC da transportadora
    <input name="rntrc" inputMode="numeric" required maxLength={14} placeholder="Número RNTRC" />
  </label>
  <label>CPF do motorista
    <input name="driverCpf" inputMode="numeric" required maxLength={14} placeholder="Somente números" />
  </label>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
   <label>UF de carregamento <input name="originUf" required minLength={2} maxLength={2} placeholder="RJ" /></label>
   <label>UF de descarga <input name="destinationUf" required minLength={2} maxLength={2} placeholder="MG" /></label>
  </div>
  <button className="button" type="submit" disabled={pending||cteDrafts.length===0}>
    {pending?"Conferindo...":"Salvar manifesto em rascunho"}
  </button>
  {!cteDrafts.length&&<p>Importe primeiro uma NF-e e prepare o CT-e correspondente.</p>}
  {state.message&&<p role="status" style={{color:state.ok?"#147d49":"#b44636"}}>{state.message}</p>}
 </form>;
}
