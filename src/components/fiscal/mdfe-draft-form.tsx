"use client";
import { useActionState, useState } from "react";
import { createMdfePreparation, type FiscalImportState } from "@/app/fiscal/actions";
export type CteDraftChoice={id:string;label:string};
export type VehicleChoice={id:string;plate:string;name:string};
export type DriverChoice={id:string;cpf:string;name:string};
const initial: FiscalImportState={ok:false,message:""};
export function MdfeDraftForm({cteDrafts,vehicles,drivers,rntrc}:{
 cteDrafts:CteDraftChoice[];vehicles:VehicleChoice[];drivers:DriverChoice[];rntrc:string;
}){
 const [state,action,pending]=useActionState(createMdfePreparation,initial);
 const [vehicleId,setVehicleId]=useState("");
 const [driverId,setDriverId]=useState("");
 const [plate,setPlate]=useState("");
 const [cpf,setCpf]=useState("");
 return <form action={action} className="card" style={{display:"grid",gap:12,maxWidth:740}}>
  <h3>Preparar MDF-e para a viagem</h3>
  <p>Selecionar veículo e motorista cadastrados preenche os campos. O documento ainda não é transmitido.</p>
  <label>CT-e de referência
    <select name="cteDraftId" required disabled={!cteDrafts.length} defaultValue=""
      style={{display:"block",width:"100%",padding:10}}>
      <option value="" disabled>Selecione a carga</option>
      {cteDrafts.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
    </select>
  </label>
  <label>Veículo cadastrado (opcional)
    <select name="vehicleId" value={vehicleId}
      onChange={e=>{setVehicleId(e.target.value);setPlate(vehicles.find(v=>v.id===e.target.value)?.plate||"");}}
      style={{display:"block",width:"100%",padding:10}}>
      <option value="">Preencher placa manualmente</option>
      {vehicles.map(v=><option key={v.id} value={v.id}>{v.name} · {v.plate}</option>)}
    </select>
  </label>
  <label>Placa
    <input name="plate" value={plate} onChange={e=>setPlate(e.target.value)}
      required maxLength={9} placeholder="ABC1D23"/>
  </label>
  <label>Motorista cadastrado (opcional)
    <select name="driverId" value={driverId}
      onChange={e=>{setDriverId(e.target.value);setCpf(drivers.find(d=>d.id===e.target.value)?.cpf||"");}}
      style={{display:"block",width:"100%",padding:10}}>
      <option value="">Preencher CPF manualmente</option>
      {drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  </label>
  <label>CPF motorista
    <input name="driverCpf" value={cpf} onChange={e=>setCpf(e.target.value)}
      required inputMode="numeric" maxLength={14}/>
  </label>
  <label>RNTRC da transportadora
    <input name="rntrc" inputMode="numeric" required maxLength={14} defaultValue={rntrc}
      placeholder="RNTRC — conferir na ANTT"/>
  </label>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
   <label>UF origem <input name="originUf" required minLength={2} maxLength={2} placeholder="RJ" /></label>
   <label>UF destino <input name="destinationUf" required minLength={2} maxLength={2} placeholder="MG" /></label>
  </div>
  <button className="button" type="submit" disabled={pending||cteDrafts.length===0}>
    {pending?"Conferindo...":"Salvar manifesto em rascunho"}
  </button>
  {!cteDrafts.length&&<p>Importe primeiro uma NF-e para preparar o CT-e correspondente.</p>}
  {state.message&&<p role="status" style={{color:state.ok?"#147d49":"#b44636"}}>{state.message}</p>}
 </form>;
}