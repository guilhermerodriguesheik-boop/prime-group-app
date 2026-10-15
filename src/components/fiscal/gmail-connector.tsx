"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCheck, CircleAlert, Inbox, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import type { GoogleClientStatus } from "@/lib/fiscal/google-credential";
type Props={connected:boolean;ready:boolean;clientStatus:GoogleClientStatus;lastSync:string|null;lastError:string|null};
export function GmailConnector({connected,ready,clientStatus,lastSync,lastError}:Props){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function sync(){
    setBusy(true);setMessage("");
    try{
      const res=await fetch("/api/fiscal/gmail/sync",{
        method:"POST",headers:{"x-prime-action":"fiscal-gmail-sync"},
      });
      const data=await res.json() as {error?:string;imported?:number;invoices?:number;errors?:number;scanned?:number};
      if(!res.ok)throw Error(data.error||"Falha na sincronização.");
      setMessage("Mensagens verificadas: "+data.scanned+" · cargas importadas: "+data.imported+
        " · NF-e lidas: "+data.invoices+" · pendências: "+data.errors+".");
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Falha na sincronização.");}
    finally{setBusy(false);}
  }
  return <div className="card fiscal-gmail-card">
    <div className="fiscal-gmail-heading">
      <div className="fiscal-gmail-icon"><Inbox size={25} strokeWidth={1.7}/></div>
      <div><span className="fiscal-small-label">CANAL DE DOCUMENTOS</span><h3>Gmail · Ortobom</h3><p>lgtransporteelogistica@gmail.com</p></div>
      <span className={"fiscal-gmail-state "+(connected?"connected":"waiting")}>{connected?<><CheckCheck size={13}/> Conectado</>:<><CircleAlert size={13}/> Não conectado</>}</span>
    </div>
    <p className="fiscal-gmail-description">O Prime Finance encontra os XMLs das cargas, identifica frete e CIOT e reúne várias notas da mesma viagem sem duplicar o frete.</p>
    <div className="fiscal-gmail-actions">
      {ready&&clientStatus!=="rejected"&&<a className="button primary" href="/api/fiscal/gmail/connect">{connected?"Renovar conexão Google":"Conectar Gmail"}<ArrowRight size={16}/></a>}
      <button className="button" type="button" disabled={!connected||!ready||busy} onClick={sync}>
        <RefreshCw size={16} className={busy?"fiscal-spin":undefined}/>{busy?"Importando...":"Importar e-mails"}
      </button>
    </div>
    {clientStatus==="rejected"&&<p role="alert" className="fiscal-inline-alert"><CircleAlert size={15}/> Diagnóstico do servidor: o Google rejeita o ID ou segredo OAuth atual. É necessário substituir a chave do cliente Google na Vercel; clicar novamente em conectar não resolve.</p>}
    {clientStatus==="unknown"&&!connected&&<p role="status" className="fiscal-inline-alert">A verificação automática da credencial Google está temporariamente indisponível. A conexão poderá ser tentada quando o Google responder.</p>}
    {!ready&&<p role="status" className="fiscal-inline-alert">A conexão automática precisa de credenciais do servidor. O envio manual continua disponível.</p>}
    {lastSync&&<p className="fiscal-gmail-meta"><MailCheck size={14}/> Última sincronização: {new Date(lastSync).toLocaleString("pt-BR")}</p>}
    {lastError&&<p role="status" className="fiscal-inline-alert"><CircleAlert size={15}/> {lastError}</p>}
    {message&&<p role="status" className="fiscal-inline-alert">{message}</p>}
    <div className="fiscal-privacy"><ShieldCheck size={15}/><span>Somente leitura. Não envia e-mails, não registra pagamentos e não transmite documentos fiscais.</span></div>
  </div>;
}
