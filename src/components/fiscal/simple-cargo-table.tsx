"use client";
import {Fragment,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {Download,RefreshCw} from "lucide-react";
import type {CargoWithReceipt} from "@/lib/fiscal/manual-balance";
import {cargoCosts,num} from "@/lib/fiscal/cargo-costs";
import {CargoEditor} from "./cargo-editor";
export type CargoOperation={cargo_reference:string;service_date:string|null;route_description:string;driver_id:string|null;
 driver_pay:number|string;driver_paid:boolean;helper_count:number;helper_rate:number|string;helpers_paid:boolean;
 diesel:number|string;tolls:number|string;other_expenses:number|string;notes:string;
 manual_settled_on:string|null;manual_settled_amount:number|string|null;manual_settlement_note:string};
export type CargoDriver={id:string;name:string;active:boolean};
export type CargoDisplay=CargoWithReceipt&{emailDate:string|null;operation:CargoOperation|null};
const brl=(n:number|null)=>n===null?"—":n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
function download(name:string,headers:string[],rows:unknown[][]){
 const cell=(v:unknown)=>{const t=String(v??"").replace(/[\r\n]/g," ").trim();
  const safe=/^[=+@\-\t]/.test(t)?"'"+t:t;return '"'+safe.replace(/"/g,'""')+'"';};
 const csv="\uFEFF"+[headers,...rows].map(r=>r.map(cell).join(";")).join("\r\n");
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
 const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}
export function SimpleCargoTable({cargo,drivers,connected}:{cargo:CargoDisplay[];drivers:CargoDriver[];connected:boolean}){
 const router=useRouter();
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[load,setLoad]=useState("");
 const [who,setWho]=useState(""),[status,setStatus]=useState(""),[expanded,setExpanded]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [newDriver,setNewDriver]=useState(""),[creating,setCreating]=useState(false);
 const names=new Map(drivers.map(d=>[d.id,d.name]));
 const filtered=cargo.filter(c=>{
  const date=c.operation?.service_date||c.emailDate||"";
  return (!from||(date!==""&&date>=from))&&(!to||(date!==""&&date<=to))
   &&(!load||c.cargo===load)&&(!who||c.operation?.driver_id===who)
   &&(!status||(status==="pending"?c.status==="Pendente":
     status==="paid"?c.status==="Pago"||c.status==="Adiantado":!c.operation?.driver_id));
 });
 const summary=filtered.reduce((s,c)=>{
  const p=cargoCosts(c.operation,c.freight);
  return {pending:s.pending+(c.pending||0),driver:s.driver+p.driverDue,helpers:s.helpers+p.helperDue,costs:s.costs+p.total};
 },{pending:0,driver:0,helpers:0,costs:0});
 async function sync(){
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/fiscal/gmail/operational-sync",{method:"POST",headers:{"x-prime-action":"prime-operations-email-sync"}});
   const x=await r.json() as {error?:string;finance?:{imported:number}};
   if(!r.ok)throw Error(x.error||"Gmail indisponível.");
   setMessage("Atualizado: "+(x.finance?.imported||0)+" e-mails novos.");router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"Erro na importação.");}finally{setBusy(false);}
 }
 async function createDriver(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setCreating(true);setMessage("");
  try{
   const r=await fetch("/api/cargas/operacao",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({action:"driver",name:newDriver})});
   const x=await r.json() as {error?:string};if(!r.ok)throw Error(x.error||"Falha ao cadastrar.");
   setNewDriver("");setMessage("Motorista cadastrado; selecione na carga.");router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"Falha ao cadastrar.");}finally{setCreating(false);}
 }
 function ledgerCSV(){
  download("prime-cargas-despesas.csv",
   ["Data","Fonte data","Carga","Rota","Frete","Adiantamento","Saldo recebido","Saldo pendente","Motorista",
   "Pagamento motorista","Ajudantes","Custo ajudantes","Diesel","Pedágio","Outras despesas","Resultado",
   "Motorista pago","Ajudantes pagos","Baixa do saldo","Data baixa manual","Valor manual","Observação manual","Situação"],
   filtered.map(c=>{const o=c.operation,x=cargoCosts(o,c.freight);
    return [o?.service_date||c.emailDate||"",o?.service_date?"Data carga":"Data e-mail",c.cargo,o?.route_description||"",
     c.freight,c.advance,c.received,c.pending,names.get(o?.driver_id||"")||"",x.driver,o?.helper_count||0,
     x.helpers,num(o?.diesel),num(o?.tolls),num(o?.other_expenses),x.result,
     o?.driver_paid?"Sim":"Não",o?.helpers_paid?"Sim":"Não",c.paymentSource||"não informado",
     o?.manual_settled_on||"",num(o?.manual_settled_amount),o?.manual_settlement_note||"",c.status];}));
 }
 function crewCSV(){
  const rows:unknown[][]=[];
  for(const c of filtered){const o=c.operation;if(!o)continue;const x=cargoCosts(o,c.freight);
   const date=o.service_date||c.emailDate||"";
   if(x.driver>0)rows.push([date,c.cargo,o.route_description,"Motorista",
    names.get(o.driver_id||"")||"Não atribuído",x.driver,o.driver_paid?"Pago":"A pagar"]);
   if(x.helpers>0)rows.push([date,c.cargo,o.route_description,"Ajudantes",
    o.helper_count+" ajudante(s)",x.helpers,o.helpers_paid?"Pago":"A pagar"]);
  }
  download("prime-fechamento-equipe.csv",["Data","Carga","Rota","Função","Profissional","Valor","Situação"],rows);
 }
 return <section className="fiscal-workspace">
  <div className="card" style={{padding:17}}>
   <div style={{display:"flex",gap:10,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
    <div><h2 style={{margin:0}}>Planilha de fretes</h2><p style={{fontSize:12,opacity:.8}}>Selecione dia, carga ou motorista e edite cada frete.</p></div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
     <button type="button" className="button primary" disabled={!connected||busy} onClick={sync}><RefreshCw size={15}/>{busy?"Atualizando":"Atualizar Gmail"}</button>
     <button type="button" className="button" disabled={!filtered.length} onClick={ledgerCSV}><Download size={15}/> Planilha CSV</button>
     <button type="button" className="button" disabled={!filtered.length} onClick={crewCSV}><Download size={15}/> Gerar pagamento da equipe</button>
    </div>
   </div>
   <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end",marginTop:12,fontSize:12}}>
    <label>De<input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{display:"block"}}/></label>
    <label>Até<input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{display:"block"}}/></label>
    <label>Frete<select value={load} onChange={e=>setLoad(e.target.value)} style={{display:"block"}}>
     <option value="">Todas as cargas</option>{cargo.map(c=><option key={c.cargo} value={c.cargo}>{c.cargo}</option>)}</select></label>
    <label>Motorista<select value={who} onChange={e=>setWho(e.target.value)} style={{display:"block"}}>
     <option value="">Todos</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    <label>Situação<select value={status} onChange={e=>setStatus(e.target.value)} style={{display:"block"}}>
     <option value="">Todas</option><option value="pending">Pendente</option><option value="paid">Recebido</option><option value="no-driver">Sem motorista</option></select></label>
    <button className="button" type="button" onClick={()=>{setFrom("");setTo("");setLoad("");setWho("");setStatus("");}}>Limpar</button>
   </div>
   <p style={{fontSize:11,opacity:.7,marginTop:8}}>Sem data da carga cadastrada, o filtro usa a data do primeiro e-mail da Ortobom.</p>
   <div style={{display:"flex",gap:24,flexWrap:"wrap",marginTop:12}}>
    <div><small>Cargas</small><p style={{fontWeight:700,margin:0}}>{filtered.length}</p></div>
    <div><small>Saldo pendente</small><p style={{fontWeight:700,margin:0}}>{brl(summary.pending)}</p></div>
    <div><small>Motoristas a pagar</small><p style={{fontWeight:700,margin:0}}>{brl(summary.driver)}</p></div>
    <div><small>Ajudantes a pagar</small><p style={{fontWeight:700,margin:0}}>{brl(summary.helpers)}</p></div>
    <div><small>Despesas totais</small><p style={{fontWeight:700,margin:0}}>{brl(summary.costs)}</p></div>
   </div>
   {message&&<p role="status" className="fiscal-inline-alert">{message}</p>}
  </div>
  <form className="card" onSubmit={createDriver} style={{display:"flex",alignItems:"end",gap:9,flexWrap:"wrap",padding:12,marginTop:12}}>
   <label style={{fontSize:12}}>Novo motorista<input placeholder="Nome completo" required minLength={3} maxLength={100}
    value={newDriver} onChange={e=>setNewDriver(e.target.value)} style={{display:"block",minWidth:210}}/></label>
   <button type="submit" className="button" disabled={creating}>{creating?"Salvando...":"+ Cadastrar motorista"}</button>
  </form>
  <div className="table-wrap fiscal-data-table" style={{marginTop:15}}>
   <table style={{minWidth:1420}}><thead><tr><th>Data</th><th>Carga / rota</th><th>Frete</th><th>Adiantamento</th>
    <th>Saldo recebido</th><th>Saldo pendente</th><th>Motorista</th><th>Motorista a pagar</th><th>Ajudantes a pagar</th>
    <th>Diesel/pedágio/outros</th><th>Resultado previsto</th><th>Situação</th><th>Ação</th></tr></thead>
    <tbody>{filtered.map(c=>{
     const o=c.operation,x=cargoCosts(o,c.freight),paid=c.status==="Pago"||c.status==="Adiantado";
     const open=c.status==="Pendente",color=paid?"#166534":open?"#b91c1c":"#64748b";
     return <Fragment key={c.cargo}>
      <tr style={{backgroundColor:paid?"#ebf8ee":open?"#fff0f0":undefined}}>
       <td>{o?.service_date||c.emailDate||"—"}{!o?.service_date&&c.emailDate&&<small style={{display:"block"}}>e-mail</small>}</td>
       <td><strong style={{color}}>{c.cargo}</strong>{o?.route_description&&<small style={{display:"block"}}>{o.route_description}</small>}</td>
       <td>{brl(c.freight)}</td><td>{brl(c.advance)}</td><td>{brl(c.received)}</td>
       <td><strong style={{color}}>{brl(c.pending)}</strong></td><td>{names.get(o?.driver_id||"")||"—"}</td>
       <td>{brl(x.driverDue)}</td><td>{brl(x.helperDue)}</td><td>{brl(x.other)}</td><td>{brl(x.result)}</td>
       <td><span style={{color,fontWeight:700,padding:"5px 9px",borderRadius:18,
        backgroundColor:paid?"#d1fae5":open?"#fee2e2":"#e2e8f0"}}>
        {c.paymentSource==="manual"?(paid?"Pago manual":"Parcial manual"):c.paymentSource==="email"?"Pago por e-mail":c.status}
       </span></td>
       <td><button type="button" className="button" aria-expanded={expanded===c.cargo}
        onClick={()=>setExpanded(expanded===c.cargo?null:c.cargo)}>{expanded===c.cargo?"Fechar":"Editar"}</button></td>
      </tr>
      {expanded===c.cargo&&<tr><td colSpan={13} style={{padding:10}}>
       <CargoEditor key={JSON.stringify(o)} cargo={c} drivers={drivers}
        onSaved={()=>{setExpanded(null);setMessage("Carga "+c.cargo+" salva.");router.refresh();}}/>
      </td></tr>}
     </Fragment>;
    })}
    {!filtered.length&&<tr><td colSpan={13}>Nenhuma carga encontrada para esses filtros.</td></tr>}
    </tbody></table>
  </div>
  <p style={{fontSize:12,opacity:.75,marginTop:10}}>Verde: saldo quitado (por e-mail ou baixa manual). Vermelho: saldo pendente. A baixa manual é reversível e não movimenta a conta bancária.
   O fechamento gera valores a pagar, sem movimentação bancária.
   Resultado estimado: frete menos despesas lançadas, antes dos impostos.</p>
 </section>;
}
