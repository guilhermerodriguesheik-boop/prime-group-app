"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {Download,RefreshCw} from "lucide-react";
import type {LedgerCargo} from "@/lib/fiscal/simple-cargo-ledger";

const brl=(n:number|null)=>n===null?"—":n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
function csvCell(value:unknown):string{
 const raw=String(value??"").replace(/[\r\n]+/g," ").trim();
 // Planilhas abertas em programas de terceiros não devem executar fórmulas.
 const safe=/^[=+@\-\t]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function exportCsv(cargas:LedgerCargo[]){
 const headers=["Carga","Frete","Adiantamento","Saldo recebido","Saldo pendente","Situação"];
 const rows=cargas.map(c=>[c.cargo,c.freight,c.advance,c.received,c.pending,c.status]);
 const data="\uFEFF"+[headers,...rows].map(r=>r.map(csvCell).join(";")).join("\r\n");
 const url=URL.createObjectURL(new Blob([data],{type:"text/csv;charset=utf-8;"}));
 const a=document.createElement("a");a.href=url;a.download="prime-cargas-e-pagamentos.csv";a.click();
 URL.revokeObjectURL(url);
}
export function SimpleCargoTable({cargo,connected}:{cargo:LedgerCargo[];connected:boolean}){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 async function sync(){
  setBusy(true);setMessage("");
  try{
   const res=await fetch("/api/fiscal/gmail/operational-sync",{
    method:"POST",headers:{"x-prime-action":"prime-operations-email-sync"},
   });
   const json=await res.json() as {error?:string;
    cargos?:{imported:number;errors:number};
    finance?:{imported:number;errors:number;hasMore:boolean}};
   if(!res.ok)throw Error(json.error||"Não foi possível atualizar.");
   const issues=(json.cargos?.errors||0)+(json.finance?.errors||0);
   setMessage("Planilha atualizada. "+(json.finance?.imported||0)+" e-mail(s) de acerto novos."+
     (json.finance?.hasMore?" Há mensagens antigas; atualize novamente.":"")+
     (issues?" "+issues+" mensagem(ns) precisam de conferência.":""));
   router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"Erro ao atualizar.");}
  finally{setBusy(false);}
 }
 const paid=cargo.filter(c=>c.status==="Pago").length;
 const outstanding=cargo.reduce((sum,c)=>sum+(c.pending||0),0);
 const advance=cargo.reduce((sum,c)=>sum+c.advance,0);
 return <section className="fiscal-workspace" id="ortobom-finance">
  <div className="card" style={{padding:18}}>
   <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}>
    <div><h2 style={{margin:0}}>Planilha de cargas</h2>
     <p style={{margin:"5px 0 0",fontSize:13,opacity:.7}}>Recebimentos da Ortobom pelo Gmail</p></div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
     <button type="button" className="button primary" disabled={!connected||busy} onClick={sync}>
      <RefreshCw size={16}/>{busy?"Atualizando...":"Atualizar Gmail"}</button>
     <button type="button" className="button" disabled={!cargo.length} onClick={()=>exportCsv(cargo)}>
      <Download size={16}/> Baixar planilha</button>
    </div>
   </div>
   {message&&<p role="status" className="fiscal-inline-alert">{message}</p>}
   <div style={{display:"flex",gap:24,flexWrap:"wrap",margin:"20px 0 8px"}}>
    <div><small style={{opacity:.7}}>Adiantamentos</small><p style={{fontWeight:700,margin:"3px 0"}}>{brl(advance)}</p></div>
    <div><small style={{opacity:.7}}>Saldo pendente</small><p style={{fontWeight:700,margin:"3px 0"}}>{brl(outstanding)}</p></div>
    <div><small style={{opacity:.7}}>Cargas com saldo pago</small><p style={{fontWeight:700,margin:"3px 0"}}>{paid} de {cargo.length}</p></div>
   </div>
  </div>
  <div className="table-wrap fiscal-data-table" style={{marginTop:16}}>
   <table>
    <thead><tr><th>Carga</th><th>Frete</th><th>Adiantamento</th>
     <th>Saldo recebido</th><th>Saldo pendente</th><th>Situação</th></tr></thead>
    <tbody>{cargo.map(c=><tr key={c.cargo}>
     <td><strong>{c.cargo}</strong></td>
     <td>{brl(c.freight)}</td><td>{brl(c.advance)}</td>
     <td>{brl(c.received)}</td><td><strong>{brl(c.pending)}</strong></td>
     <td><span className={"badge "+(c.status==="Pago"?"green":c.status==="Sem valor"?"orange":"")}>
      {c.status}</span></td>
    </tr>)}
    {!cargo.length&&<tr><td colSpan={6}>Ainda não há cargas importadas.</td></tr>}
    </tbody>
   </table>
  </div>
  <p style={{fontSize:12,opacity:.75,marginTop:10}}>
   Regra automática: quando uma carga aparece no e-mail de Pagamento de período, o saldo
   informado é marcado como recebido. E-mails repetidos não duplicam valores.
   E-mails sem identificação da carga ou valor suficiente ficam fora da baixa automática.
  </p>
 </section>;
}
