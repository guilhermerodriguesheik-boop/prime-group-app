"use client";
import {useState,type FormEvent} from "react";
import type {CargoDisplay,CargoDriver} from "./simple-cargo-table";
import {num} from "@/lib/fiscal/cargo-costs";

export function CargoEditor({cargo,drivers,onSaved}:{cargo:CargoDisplay;drivers:CargoDriver[];onSaved:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const op=cargo.operation;
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError("");
  const f=new FormData(e.currentTarget);
  const payload={action:"save",cargo:cargo.cargo,
   service_date:String(f.get("service_date")||""),
   route_description:String(f.get("route_description")||""),
   driver_id:String(f.get("driver_id")||""),
   driver_pay:Number(f.get("driver_pay")||0),driver_paid:f.get("driver_paid")==="on",
   helper_count:Number(f.get("helper_count")||0),helper_rate:Number(f.get("helper_rate")||0),
   helpers_paid:f.get("helpers_paid")==="on",diesel:Number(f.get("diesel")||0),
   tolls:Number(f.get("tolls")||0),other_expenses:Number(f.get("other_expenses")||0),
   notes:String(f.get("notes")||"")};
  try{
   const res=await fetch("/api/cargas/operacao",{method:"POST",
    headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
   const body=await res.json() as {error?:string};
   if(!res.ok)throw Error(body.error||"Não foi possível salvar.");
   onSaved();
  }catch(x){setError(x instanceof Error?x.message:"Falha ao salvar.");}
  finally{setBusy(false);}
 }
 const field={width:"100%",minWidth:115};
 return <form onSubmit={save} style={{padding:18,background:"var(--panel)",color:"var(--text)",borderRadius:10}}>
  <strong>Motorista, ajudantes e despesas · carga {cargo.cargo}</strong>
  <p style={{fontSize:12,opacity:.8}}>Os valores geram o fechamento da equipe, sem realizar transferência bancária.</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginTop:12}}>
   <label>Data da carga<input name="service_date" type="date" style={field} defaultValue={op?.service_date||""}/></label>
   <label>Rota <input name="route_description" maxLength={160} style={field} placeholder="Origem → destino" defaultValue={op?.route_description||""}/></label>
   <label>Motorista<select name="driver_id" style={field} defaultValue={op?.driver_id||""}>
    <option value="">Selecionar motorista</option>
    {drivers.filter(d=>d.active||d.id===op?.driver_id).map(d=><option value={d.id} key={d.id}>{d.name}</option>)}
   </select></label>
   <label>Motorista (R$)<input name="driver_pay" type="number" step=".01" min="0" max="1000000" style={field} defaultValue={num(op?.driver_pay)}/></label>
   <label>Qtd. ajudantes<input name="helper_count" type="number" step="1" min="0" max="30" style={field} defaultValue={op?.helper_count||0}/></label>
   <label>Valor por ajudante (R$)<input name="helper_rate" type="number" step=".01" min="0" max="100000" style={field} defaultValue={num(op?.helper_rate)}/></label>
   <label>Diesel (R$)<input name="diesel" type="number" step=".01" min="0" max="1000000" style={field} defaultValue={num(op?.diesel)}/></label>
   <label>Pedágio (R$)<input name="tolls" type="number" step=".01" min="0" max="1000000" style={field} defaultValue={num(op?.tolls)}/></label>
   <label>Outras despesas (R$)<input name="other_expenses" type="number" step=".01" min="0" max="1000000" style={field} defaultValue={num(op?.other_expenses)}/></label>
   <label>Observações<input name="notes" style={field} maxLength={300} placeholder="Ajudantes, despesa..." defaultValue={op?.notes||""}/></label>
  </div>
  <div style={{display:"flex",gap:20,flexWrap:"wrap",marginTop:15}}>
   <label style={{display:"flex",gap:6,alignItems:"center"}}><input name="driver_paid" type="checkbox" defaultChecked={Boolean(op?.driver_paid)}/> Motorista já pago</label>
   <label style={{display:"flex",gap:6,alignItems:"center"}}><input name="helpers_paid" type="checkbox" defaultChecked={Boolean(op?.helpers_paid)}/> Ajudantes já pagos</label>
  </div>
  {error&&<p role="alert" style={{color:"#dc2626"}}>{error}</p>}
  <button type="submit" disabled={busy} className="button primary" style={{marginTop:15}}>{busy?"Salvando...":"Salvar frete e despesas"}</button>
 </form>;
}
