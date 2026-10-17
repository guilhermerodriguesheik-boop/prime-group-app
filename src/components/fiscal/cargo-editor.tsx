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
 return <><form onSubmit={save} style={{padding:18,background:"var(--panel)",color:"var(--text)",borderRadius:10}}>
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
 </form>
  <ManualBalanceEditor cargo={cargo} onSaved={onSaved}/>
 </>;
}

function ManualBalanceEditor({cargo,onSaved}:{cargo:CargoDisplay;onSaved:()=>void}){
 const op=cargo.operation;
 const isManual=Boolean(op?.manual_settled_on);
 const byEmail=cargo.paymentSource==="email";
 const currentDate=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",
  year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const [date,setDate]=useState(op?.manual_settled_on||currentDate);
 const [value,setValue]=useState(String(op?.manual_settled_amount??cargo.pending??""));
 const [note,setNote]=useState(op?.manual_settlement_note||"");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(action:"settle"|"undo"){
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/cargas/baixa-manual",{method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({action,cargo:cargo.cargo,date,amount:value,note})});
   const data=await res.json() as {error?:string};
   if(!res.ok)throw Error(data.error||"Não foi possível registrar a baixa.");
   onSaved();
  }catch(e){setError(e instanceof Error?e.message:"Falha ao atualizar baixa.");}
  finally{setBusy(false);}
 }
 if(byEmail&&!isManual)return <div style={{padding:"12px 16px",marginTop:12,
  border:"1px solid #86efac",borderRadius:10,color:"#166534",background:"#ecfdf5"}}>
  <strong>Saldo quitado por e-mail da Ortobom.</strong> Nenhuma baixa manual necessária.
 </div>;
 return <section style={{marginTop:13,padding:16,border:"1px solid var(--line)",
  borderRadius:10,background:"var(--panel)",color:"var(--text)"}}>
  <h3 style={{margin:"0 0 5px",fontSize:15}}>Baixa manual do saldo da Ortobom</h3>
  <p style={{fontSize:12,opacity:.8,marginTop:0}}>
   Use quando o saldo já entrou no banco, mas o e-mail de pagamento não chegou.
   O registro é manual e não movimenta a conta bancária.
  </p>
  {isManual&&<p style={{color:"#166534",fontSize:13,fontWeight:700}}>
   Baixa manual registrada: {op?.manual_settled_on} · R$ {Number(op?.manual_settled_amount||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}
  </p>}
  {byEmail&&<p style={{fontSize:12}}>O e-mail de pagamento também foi identificado. A baixa automática tem prioridade para evitar duplicidade.</p>}
  {!byEmail&&cargo.freight!==null&&<div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end"}}>
   <label>Data do recebimento<input type="date" value={date} max={currentDate}
    onChange={e=>setDate(e.target.value)} style={{display:"block"}}/></label>
   <label>Valor recebido (R$)<input type="number" value={value} step=".01" min="0.01" max="1000000"
    onChange={e=>setValue(e.target.value)} style={{display:"block",width:145}}/></label>
   <label>Observação (opcional)<input value={note} onChange={e=>setNote(e.target.value)}
    maxLength={300} placeholder="Ex.: recebido via PIX" style={{display:"block",minWidth:190}}/></label>
   <button className="button primary" type="button" disabled={busy||!date||!value}
    onClick={()=>submit("settle")}>{busy?"Salvando...":isManual?"Atualizar baixa":"Dar baixa manual"}</button>
  </div>}
  {!byEmail&&cargo.freight===null&&<p style={{fontSize:12}}>Informe o valor do frete antes da baixa manual.</p>}
  {isManual&&<button type="button" className="button" style={{marginTop:10}}
   disabled={busy} onClick={()=>submit("undo")}>Desfazer baixa manual</button>}
  {error&&<p role="alert" style={{color:"#dc2626"}}>{error}</p>}
 </section>;
}
