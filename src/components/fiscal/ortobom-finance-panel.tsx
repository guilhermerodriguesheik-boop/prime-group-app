"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {RefreshCw} from "lucide-react";
type Cargo={cargo:string;freight:number|null;claimed:number|null;advance:number;balance:number|null;cte:string|null;status:string};
type Period={id:string;date:string|null;period:string;deposit:number|null;promissory:number|null;loads:number};
export function OrtobomFinancePanel({cargo,periods,emailCount,connected}:{
 cargo:Cargo[];periods:Period[];emailCount:number;connected:boolean;
}){
 const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 const brl=(n:number|null)=>n===null?"—":n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
 async function importFinance(){
  setBusy(true);setMessage("");
  try{
   const res=await fetch("/api/fiscal/gmail/financial-sync",{method:"POST",headers:{"x-prime-action":"ortobom-financial-sync"}});
   const json=await res.json() as {error?:string;scanned?:number;imported?:number;errors?:number;hasMore?:boolean};
   if(!res.ok)throw Error(json.error||"Falha na importação.");
   setMessage((json.imported||0)+" e-mail(s) importados, "+(json.scanned||0)+" analisados."+
    (json.errors?" "+json.errors+" pendências.":"")+(json.hasMore?" Existem mensagens mais antigas; clique novamente para continuar.":""));
   router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"Falha ao importar.");}
  finally{setBusy(false);}
 }
 return <section id="ortobom-finance">
  <div className="fiscal-section-intro"><div><span className="fiscal-section-kicker">05 / CONFERÊNCIA FINANCEIRA</span>
   <h2>Adiantamentos e pagamentos da Ortobom</h2>
   <p>Organizados por carga e período, com comparação ao valor contratado.</p>
  </div><span className="fiscal-count">{emailCount} e-mails</span></div>
  <div className="card" style={{padding:18,display:"grid",gap:12}}>
   <button type="button" className="button primary" disabled={busy||!connected} onClick={importFinance}
    style={{justifySelf:"start",display:"inline-flex",gap:8,alignItems:"center"}}>
    <RefreshCw size={15}/>{busy?"Importando...":"Importar e-mails de adiantamento e pagamento"}
   </button>
   {message&&<p role="status" className="fiscal-inline-alert">{message}</p>}
   <p style={{fontSize:12,opacity:.76}}>Informações extraídas dos e-mails, não comprovantes de crédito bancário. Depósitos e descontos por período são registrados uma vez por mensagem. Nenhuma transação financeira é criada automaticamente.</p>
  </div>
  <div className="fiscal-section-intro"><div><h3>Receitas por carga</h3>
   <p>O adiantamento informado e o saldo previsto são controlados separadamente.</p></div></div>
  <div className="table-wrap fiscal-data-table"><table>
   <thead><tr><th>Carga</th><th>Frete no app</th><th>Frete informado</th><th>Adiantamento informado</th><th>Saldo informado</th><th>CT-e</th><th>Conferência</th></tr></thead>
   <tbody>{cargo.map(c=><tr key={c.cargo}><td><strong>{c.cargo}</strong></td>
    <td>{brl(c.freight)}</td><td>{brl(c.claimed)}</td><td>{brl(c.advance)}</td><td>{brl(c.balance)}</td>
    <td>{c.cte||"—"}</td><td>{c.status}</td></tr>)}
    {!cargo.length&&<tr><td colSpan={7}>Nenhum demonstrativo importado até agora.</td></tr>}
   </tbody></table></div>
  <div className="fiscal-section-intro"><div><h3>Pagamentos por período</h3>
   <p>Conciliação com extrato bancário ainda não confirmada.</p></div></div>
  <div className="table-wrap fiscal-data-table"><table>
   <thead><tr><th>Data informada</th><th>Período</th><th>Depósito informado</th><th>Nota promissória / desconto</th><th>Cargas</th><th>Situação</th></tr></thead>
   <tbody>{periods.map(p=><tr key={p.id}><td>{p.date||"—"}</td><td>{p.period}</td><td>{brl(p.deposit)}</td><td>{brl(p.promissory)}</td><td>{p.loads}</td><td>Verificar no banco</td></tr>)}
    {!periods.length&&<tr><td colSpan={6}>Nenhum relatório de período encontrado.</td></tr>}
   </tbody></table></div>
 </section>;
}
