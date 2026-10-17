"use client";
import {useState} from "react";
import type {CargoDisplay,CargoDriver} from "./simple-cargo-table";
import {selectedFreightTotals,selectedDriverId,driverWhatsAppSummary,whatsappDraftLink} from "@/lib/fiscal/selected-freights";
const brl=(v:number)=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function SelectedFreightSummary({rows,drivers,onClear}:{rows:CargoDisplay[];drivers:CargoDriver[];onClear:()=>void}){
 const sum=selectedFreightTotals(rows);
 const id=selectedDriverId(rows);
 const driver=id?drivers.find(d=>d.id===id):undefined;
 const [phone,setPhone]=useState(driver?.phone||"");
 const summary=driver&&rows.length<=35?driverWhatsAppSummary(rows,driver.name):null;
 const link=summary?whatsappDraftLink(summary,phone):null;
 const missing=rows.some(r=>!r.operation?.driver_id||Number(r.operation.driver_pay)<=0);
 const mixed=new Set(rows.map(r=>r.operation?.driver_id).filter(Boolean)).size>1;
 return <section className="card" style={{padding:16,marginTop:12,border:"1px solid var(--line)"}} aria-label="Fechamento dos fretes selecionados">
  <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",alignItems:"center",gap:10}}>
   <h3 style={{margin:0}}>Seleção: {rows.length} frete(s)</h3>
   <button type="button" className="button" onClick={onClear}>Limpar seleção</button>
  </div>
  <div style={{display:"flex",gap:22,flexWrap:"wrap",marginTop:14}}>
   <div><small>Fretes somados</small><div><strong>{brl(sum.freight)}</strong></div></div>
   <div><small>Adiantamentos</small><div><strong>{brl(sum.advance)}</strong></div></div>
   <div><small>Saldo recebido</small><div><strong>{brl(sum.received)}</strong></div></div>
   <div><small>Saldo pendente</small><div><strong>{brl(sum.pending)}</strong></div></div>
   <div><small>Motorista combinado</small><div><strong>{brl(sum.driverAgreed)}</strong></div></div>
   <div><small>Motorista a pagar</small><div><strong>{brl(sum.driverDue)}</strong></div></div>
   <div><small>Ajudantes a pagar</small><div><strong>{brl(sum.helpersDue)}</strong></div></div>
   <div><small>Despesas totais</small><div><strong>{brl(sum.costs)}</strong></div></div>
   <div><small>Resultado estimado</small><div><strong>{sum.missingFreight?"Incompleto":brl(sum.estimatedResult)}</strong></div></div>
  </div>
  <div style={{borderTop:"1px solid var(--line)",marginTop:15,paddingTop:12}}>
   <strong>Enviar fechamento ao motorista pelo WhatsApp</strong>
   <p style={{fontSize:12,opacity:.8,margin:"6px 0 10px"}}>
    O texto contém somente os números das cargas e os valores do motorista,
    não mostra o preço cobrado da Ortobom ou despesas internas.
   </p>
   {!driver&&<p role="status" style={{fontSize:12}}>
    {mixed?"Existem motoristas diferentes na seleção. Selecione somente os fretes de um motorista.":
     missing?"Atribua um motorista e um valor combinado em cada frete para enviar o fechamento.":
     "Verifique o cadastro do motorista."}
   </p>}
   {driver&&rows.length>35&&<p style={{fontSize:12}}>Para enviar, selecione no máximo 35 cargas por mensagem.</p>}
   {driver&&summary&&<div style={{display:"flex",alignItems:"end",flexWrap:"wrap",gap:10}}>
    <label style={{fontSize:12}}>Telefone WhatsApp de {driver.name}
     <input type="tel" placeholder="DDD + telefone (ou deixe vazio)" value={phone}
      onChange={e=>setPhone(e.target.value)} maxLength={25} style={{display:"block",minWidth:225}}/>
    </label>
    {link?<a className="button primary" href={link} target="_blank" rel="noopener noreferrer">
     {phone.trim()?"Abrir WhatsApp do motorista":"Abrir WhatsApp e escolher contato"}
    </a>:<button type="button" className="button" disabled>Telefone inválido</button>}
    <details style={{width:"100%",fontSize:12}}><summary style={{cursor:"pointer"}}>Pré-visualizar mensagem</summary>
     <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",padding:10,background:"var(--panel2)",
      border:"1px solid var(--line)",borderRadius:8,marginTop:8}}>{summary}</pre>
    </details>
   </div>}
   <p style={{fontSize:11,opacity:.75,marginTop:9}}>
    O WhatsApp abrirá com a mensagem pronta. Confira o destinatário e pressione Enviar;
    nenhum pagamento ou envio é feito automaticamente.
   </p>
  </div>
 </section>;
}
