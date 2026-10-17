"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {Download,RefreshCw} from "lucide-react";
export type Cargo={
 cargo:string; freight:number|null; claimed:number|null; advance:number;
 balance:number|null; cost:number; profit:number|null; cte:string|null;
 ciot:string|null; status:string; invoices:number; documented:boolean;
};
export type Period={id:string;date:string|null;period:string;deposit:number|null;promissory:number|null;loads:number;bankMatch:string};
export type SentDocument={
 id:string; messageId:string; cargo:string|null; cte:string|null;
 subject:string; date:string|null; files:string[]; hasXml:boolean; evidence:string;
};
const brl=(n:number|null)=>n===null?"—":n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
function csvCell(value:unknown){
 const raw=String(value??"").replace(/[\r\n]+/g," ").trim();
 // Evita execução de fórmulas ao abrir o CSV em Excel/Sheets.
 const safe=/^[=+@\-\t]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function saveCsv(name:string,headers:string[],rows:unknown[][]){
 const content="\uFEFF"+[headers,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
 const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8;"}));
 const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();
 URL.revokeObjectURL(url);
}
const gmailUrl=(id:string)=>"https://mail.google.com/mail/u/?authuser=lgtransporteelogistica%40gmail.com#all/"+encodeURIComponent(id);
export function OrtobomFinancePanel({cargo,periods,documents,emailCount,connected}:{
 cargo:Cargo[];periods:Period[];documents:SentDocument[];emailCount:number;connected:boolean;
}){
 const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 async function importFinance(){
  setBusy(true);setMessage("");
  try{
   const res=await fetch("/api/fiscal/gmail/operational-sync",{
    method:"POST",headers:{"x-prime-action":"prime-operations-email-sync"}});
   const data=await res.json() as {
    error?:string;cargos?:{imported:number;errors:number};
    finance?:{imported:number;errors:number;hasMore?:boolean};
    cteEmails?:{imported:number;errors:number;hasMore?:boolean};
   };
   if(!res.ok)throw Error(data.error||"Falha na sincronização.");
   setMessage("Atualização concluída: "+(data.cargos?.imported??0)+" cargas, "+
    (data.finance?.imported??0)+" demonstrativos, "+(data.cteEmails?.imported??0)+" e-mails de CT-e."+
    ((data.finance?.hasMore||data.cteEmails?.hasMore)?" Há páginas antigas: sincronize novamente.":"")+
    ((data.cargos?.errors||data.finance?.errors||data.cteEmails?.errors)?" Algumas mensagens exigem revisão.":""));
   router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"Falha ao importar.");}
  finally{setBusy(false);}
 }
 return <section id="ortobom-finance">
  <div className="fiscal-section-intro">
   <div><span className="fiscal-section-kicker">CENTRAL OPERACIONAL</span>
    <h2>Planilha de cargas e recebimentos</h2>
    <p>Fretes, adiantamentos, saldo, custo direto e comprovantes de CT-e em um só lugar.</p>
   </div><span className="fiscal-count">{emailCount} demonstrativos</span>
  </div>
  <div className="card" style={{padding:18,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
   <button type="button" className="button primary" disabled={!connected||busy} onClick={importFinance}>
    <RefreshCw size={15}/>{busy?"Sincronizando...":"Atualizar dados do Gmail"}
   </button>
   <button type="button" className="button" disabled={!cargo.length}
    onClick={()=>saveCsv("prime-cargas.csv",
    ["Carga","Frete contratado","Frete informado","Adiantamento declarado","Saldo previsto","Custo direto registrado","Resultado estimado","CT-e","CIOT","NF-e","Status"],
    cargo.map(c=>[c.cargo,c.freight,c.claimed,c.advance,c.balance,c.cost,c.profit,c.cte,c.ciot,c.invoices,c.status]))}>
    <Download size={15}/> Exportar cargas CSV
   </button>
   <button type="button" className="button" disabled={!periods.length}
    onClick={()=>saveCsv("prime-acertos.csv",
    ["Data informada","Período","Depósito declarado","Nota promissória/desconto","Cargas","Conciliação bancária"],
    periods.map(p=>[p.date,p.period,p.deposit,p.promissory,p.loads,p.bankMatch]))}>
    <Download size={15}/> Exportar acertos CSV
   </button>
   {message&&<p role="status" className="fiscal-inline-alert">{message}</p>}
  </div>
  <p style={{fontSize:12,opacity:.8,margin:"12px 0"}}>
   Adiantamento e pagamento em e-mails são valores <strong>declarados</strong>. Crédito compatível em extrato ainda
   requer conferência; não representa quitação automática. Custos aparecem apenas quando lançados na viagem
   (motorista, equipe, diesel e pedágio). Margem e saldo são estimativas, sem impostos ou custos não cadastrados.
  </p>
  <div className="table-wrap fiscal-data-table"><table>
   <thead><tr><th>Carga</th><th>Frete contratado</th><th>Valor informado</th>
    <th>Adiantamento</th><th>Saldo previsto</th><th>Custo registrado</th>
    <th>Margem estimada</th><th>CT-e</th><th>NF-e</th><th>Situação</th></tr></thead>
   <tbody>{cargo.map(c=><tr key={c.cargo}>
    <td><strong>{c.cargo}</strong>{c.ciot&&<small style={{display:"block"}}>CIOT {c.ciot}</small>}</td>
    <td>{brl(c.freight)}</td><td>{brl(c.claimed)}</td><td>{brl(c.advance)}</td>
    <td>{brl(c.balance)}</td><td>{brl(c.cost)}</td><td>{brl(c.profit)}</td>
    <td>{c.cte|| (c.documented?"PDF anexado":"—")}</td><td>{c.invoices||"—"}</td>
    <td>{c.status}</td>
   </tr>)}
   {!cargo.length&&<tr><td colSpan={10}>Ainda não foram importadas cargas com identificação suficiente.</td></tr>}
   </tbody></table></div>
  <div className="fiscal-section-intro"><div><h3>Acertos e depósitos informados</h3>
   <p>Conciliação dos e-mails de pagamento por período com lançamentos existentes nos extratos.</p>
  </div></div>
  <div className="table-wrap fiscal-data-table"><table>
   <thead><tr><th>Data</th><th>Período</th><th>Depósito declarado</th>
    <th>Desconto informado</th><th>Cargas</th><th>Extrato</th></tr></thead>
   <tbody>{periods.map(p=><tr key={p.id}><td>{p.date||"—"}</td>
    <td>{p.period}</td><td>{brl(p.deposit)}</td><td>{brl(p.promissory)}</td>
    <td>{p.loads}</td><td>{p.bankMatch}</td></tr>)}
   {!periods.length&&<tr><td colSpan={6}>Nenhum acerto importado.</td></tr>}
   </tbody></table></div>
  <div className="fiscal-section-intro"><div><h3>CT-e encaminhados para a Ortobom</h3>
   <p>Histórico dos anexos dos e-mails enviados. PDF/minuta não comprova autorização SEFAZ.</p>
  </div><span className="fiscal-count">{documents.length} e-mails</span></div>
  <div className="table-wrap fiscal-data-table"><table>
   <thead><tr><th>Data</th><th>Carga</th><th>CT-e identificado</th><th>Anexo</th><th>Conferência</th><th>Gmail</th></tr></thead>
   <tbody>{documents.map(d=><tr key={d.id}>
    <td>{d.date?new Date(d.date).toLocaleDateString("pt-BR"):"—"}</td>
    <td>{d.cargo||"A vincular"}</td><td>{d.cte||"Não identificado"}</td>
    <td title={d.files.join(", ")}>{d.files.slice(0,2).join(", ").slice(0,90)||"—"}</td>
    <td>{d.evidence==="xml_authorization_claim_unverified"?"XML relata autorização; validar":"Documento anexado; conferir"}</td>
    <td><a href={gmailUrl(d.messageId)} target="_blank" rel="noopener noreferrer">Abrir e-mail ↗</a></td>
   </tr>)}
   {!documents.length&&<tr><td colSpan={6}>Nenhum anexo CT-e enviado foi importado. Clique em atualizar para buscar no Gmail.</td></tr>}
   </tbody></table></div>
 </section>;
}
