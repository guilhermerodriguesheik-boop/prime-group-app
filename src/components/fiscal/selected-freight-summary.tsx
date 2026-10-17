"use client";
import {useState} from "react";
import type {CargoDisplay,CargoDriver} from "./simple-cargo-table";
import {
 selectedFreightTotals,selectedDriverId,selectedLoadsWhatsAppSummary,
 driverWhatsAppSummary,whatsappDraftLink
} from "@/lib/fiscal/selected-freights";
const brl=(v:number)=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function SelectedFreightSummary({rows,drivers,onClear}:{rows:CargoDisplay[];drivers:CargoDriver[];onClear:()=>void}){
 const totals=selectedFreightTotals(rows);
 const id=selectedDriverId(rows);
 const driver=id?drivers.find(x=>x.id===id):undefined;
 const [includeValues,setIncludeValues]=useState(false);
 const [mode,setMode]=useState<"cargas"|"motorista">("cargas");
 const [phone,setPhone]=useState("");
 const driverMessage=driver?driverWhatsAppSummary(rows,driver.name):null;
 const canShowDriver=Boolean(driverMessage)&&rows.length<=35;
 const selectedMode=mode==="motorista"&&canShowDriver?"motorista":"cargas";
 const message=selectedMode==="motorista"&&driverMessage?
  driverMessage:selectedLoadsWhatsAppSummary(rows,includeValues);
 const link=rows.length<=35?whatsappDraftLink(message,phone):null;
 return <section className="card" style={{padding:16,marginTop:12,border:"1px solid var(--line)"}} aria-label="Resumo das cargas selecionadas">
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
   <h3 style={{margin:0}}>Seleção: {rows.length} frete(s)</h3>
   <button type="button" className="button" onClick={onClear}>Limpar seleção</button>
  </div>
  <div style={{display:"flex",gap:22,flexWrap:"wrap",marginTop:14}}>
   <div><small>Fretes somados</small><div><strong>{brl(totals.freight)}</strong></div></div>
   <div><small>Adiantamentos</small><div><strong>{brl(totals.advance)}</strong></div></div>
   <div><small>Saldo recebido</small><div><strong>{brl(totals.received)}</strong></div></div>
   <div><small>Saldo pendente</small><div><strong>{brl(totals.pending)}</strong></div></div>
   <div><small>Motorista combinado</small><div><strong>{brl(totals.driverAgreed)}</strong></div></div>
   <div><small>Motorista a pagar</small><div><strong>{brl(totals.driverDue)}</strong></div></div>
   <div><small>Ajudantes a pagar</small><div><strong>{brl(totals.helpersDue)}</strong></div></div>
   <div><small>Despesas totais</small><div><strong>{brl(totals.costs)}</strong></div></div>
   <div><small>Resultado estimado</small><div><strong>{totals.missingFreight?"Incompleto":brl(totals.estimatedResult)}</strong></div></div>
  </div>
  <div style={{borderTop:"1px solid var(--line)",marginTop:15,paddingTop:14}}>
   <h4 style={{margin:"0 0 8px"}}>Compartilhar pelo WhatsApp</h4>
   <p style={{fontSize:12,opacity:.8,marginTop:0}}>
    Compartilhe as cargas selecionadas sem precisar cadastrar motorista ou pagamento.
    O texto não será enviado automaticamente.
   </p>
   <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:12}}>
    <label style={{display:"flex",gap:6,alignItems:"center"}}>
     <input type="radio" checked={selectedMode==="cargas"} onChange={()=>setMode("cargas")}/> Resumo das cargas
    </label>
    <label style={{display:"flex",gap:6,alignItems:"center",opacity:canShowDriver?1:.55}}>
     <input type="radio" checked={selectedMode==="motorista"}
      disabled={!canShowDriver} onChange={()=>setMode("motorista")}/> Fechamento do motorista
    </label>
   </div>
   {!canShowDriver&&<p style={{fontSize:12,opacity:.75,marginTop:0}}>
    Para um fechamento específico de motorista, atribua o mesmo motorista e valor a todas as cargas.
    O compartilhamento de cargas abaixo já está liberado.
   </p>}
   {selectedMode==="cargas"&&<label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,marginBottom:12}}>
    <input type="checkbox" checked={includeValues} onChange={e=>setIncludeValues(e.target.checked)}/>
    Incluir preços dos fretes e saldos no WhatsApp
   </label>}
   <div style={{display:"flex",alignItems:"end",flexWrap:"wrap",gap:10}}>
    <label style={{fontSize:12}}>Telefone do destinatário (opcional)
     <input type="tel" placeholder="DDD e número, ou deixe vazio"
      value={phone} onChange={e=>setPhone(e.target.value)} maxLength={25}
      style={{display:"block",minWidth:230}}/>
    </label>
    {link?<a className="button primary" href={link} target="_blank" rel="noopener noreferrer">
      Enviar pelo WhatsApp
    </a>:<button className="button" disabled type="button">
      {rows.length>35?"Selecione no máximo 35 cargas":"Telefone inválido"}
    </button>}
   </div>
   <details style={{marginTop:12,fontSize:12}}>
    <summary style={{cursor:"pointer"}}>Ver mensagem antes de enviar</summary>
    <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",padding:12,
     border:"1px solid var(--line)",borderRadius:8,marginTop:8}}>{message}</pre>
   </details>
   <p style={{fontSize:11,opacity:.75,marginTop:10}}>
    A ação abre o WhatsApp com um rascunho. Escolha ou confira o contato e confirme o envio.
    Não gera pagamento, baixa bancária ou confirmação de entrega.
   </p>
  </div>
 </section>;
}
