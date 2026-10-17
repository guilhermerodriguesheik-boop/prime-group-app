"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCheck, CircleAlert, Inbox, MailCheck, RefreshCw, ShieldCheck, ListChecks } from "lucide-react";
import type { GoogleClientStatus } from "@/lib/fiscal/google-credential";
type InboxMail={id:string;from:string;subject:string;date:string;snippet:string;imported:boolean};
type Props={connected:boolean;ready:boolean;clientStatus:GoogleClientStatus;lastSync:string|null;lastError:string|null};
export function GmailConnector({connected,ready,clientStatus,lastSync,lastError}:Props){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [inbox,setInbox]=useState<InboxMail[]|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  async function sync(){
    setBusy(true);setMessage("");
    try{
      const res=await fetch("/api/fiscal/gmail/operational-sync",{
        method:"POST",headers:{"x-prime-action":"prime-operations-email-sync"},
      });
      const data=await res.json() as {error?:string;cargos?:{imported:number;invoices:number;errors:number;scanned:number};finance?:{imported:number;errors:number};cteEmails?:{imported:number;errors:number};};
      if(!res.ok)throw Error(data.error||"Falha na sincronização.");
      setMessage("Cargas: "+(data.cargos?.imported??0)+" · NF-e: "+(data.cargos?.invoices??0)+" · adiantamentos/acertos: "+(data.finance?.imported??0)+" · CT-e anexados: "+(data.cteEmails?.imported??0)+" · pendências: "+((data.cargos?.errors??0)+(data.finance?.errors??0)+(data.cteEmails?.errors??0))+".");
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Falha na sincronização.");}
    finally{setBusy(false);}
  }

  async function loadInbox(){
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/fiscal/gmail/inbox",{cache:"no-store"});
      const data=await r.json() as {items?:InboxMail[];error?:string};
      if(!r.ok)throw Error(data.error||"Não foi possível abrir a caixa de entrada.");
      setInbox(data.items||[]);setSelected([]);
      setMessage((data.items||[]).length+" mensagens da Ortobom encontradas na caixa de entrada.");
    }catch(error){setMessage(error instanceof Error?error.message:"Falha ao consultar o Gmail.");}
    finally{setBusy(false);}
  }
  function toggle(id:string){
    setSelected(old=>old.includes(id)?old.filter(x=>x!==id):old.length<8?[...old,id]:old);
  }
  async function importSelected(){
    if(!selected.length)return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/fiscal/gmail/import-selected",{
        method:"POST",headers:{"Content-Type":"application/json","x-prime-action":"fiscal-gmail-import-selected"},
        body:JSON.stringify({ids:selected}),
      });
      const data=await r.json() as {error?:string;imported?:number;invoices?:number;errors?:number;skipped?:number};
      if(!r.ok)throw Error(data.error||"Falha ao importar os e-mails.");
      setMessage("Cargas importadas: "+data.imported+" · NF-e: "+data.invoices+
        " · já importados/ignorados: "+data.skipped+" · pendências: "+data.errors+".");
      setSelected([]);setInbox(null);router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Falha na importação seletiva.");}
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
      <button className="button" type="button" disabled={!connected||!ready||busy} onClick={loadInbox}>
        <Inbox size={16}/>{busy?"Consultando...":"Escolher e-mails da caixa de entrada"}
      </button>
      <button className="button" type="button" disabled={!connected||!ready||busy} onClick={sync}>
        <RefreshCw size={16} className={busy?"fiscal-spin":undefined}/>{"Sincronizar documentos e financeiro"}
      </button>
    </div>
    {clientStatus==="rejected"&&<p role="alert" className="fiscal-inline-alert"><CircleAlert size={15}/> Diagnóstico do servidor: o Google rejeita o ID ou segredo OAuth atual. É necessário substituir a chave do cliente Google na Vercel; clicar novamente em conectar não resolve.</p>}
    {clientStatus==="unknown"&&!connected&&<p role="status" className="fiscal-inline-alert">A verificação automática da credencial Google está temporariamente indisponível. A conexão poderá ser tentada quando o Google responder.</p>}
    {!ready&&<p role="status" className="fiscal-inline-alert">A conexão automática precisa de credenciais do servidor. O envio manual continua disponível.</p>}
    {lastSync&&<p className="fiscal-gmail-meta"><MailCheck size={14}/> Última sincronização: {new Date(lastSync).toLocaleString("pt-BR")}</p>}
    {lastError&&<p role="status" className="fiscal-inline-alert"><CircleAlert size={15}/> {lastError}</p>}
    {message&&<p role="status" className="fiscal-inline-alert">{message}</p>}
    {inbox!==null&&<div className="fiscal-manual-inbox">
      <div className="fiscal-inbox-heading"><strong>Caixa de entrada · e-mails da Ortobom</strong><small>Selecione até 8 mensagens. Nenhum e-mail será apagado ou marcado como lido.</small></div>
      {inbox.length===0&&<p>Nenhuma mensagem da Ortobom encontrada na caixa de entrada.</p>}
      {inbox.map(mail=><label className={"fiscal-inbox-message "+(mail.imported?"is-imported":"")} key={mail.id}>
        <input type="checkbox" checked={selected.includes(mail.id)} disabled={mail.imported||busy||(!selected.includes(mail.id)&&selected.length>=8)}
          onChange={()=>toggle(mail.id)} aria-label={"Selecionar "+mail.subject}/>
        <span><strong>{mail.subject||"Sem assunto"}</strong>
          <small>{mail.from} · {mail.date}</small>
          {mail.snippet&&<small>{mail.snippet}</small>}
        </span>
        <em>{mail.imported?"Já importado":"Pendente"}</em>
      </label>)}
      {inbox.length>0&&<div className="fiscal-inbox-footer">
        <button className="button primary" type="button" disabled={!selected.length||busy} onClick={importSelected}>
          <ListChecks size={16}/> {busy?"Importando...":"Importar "+selected.length+" e-mail(s) selecionado(s)"}
        </button>
        <button className="button" type="button" disabled={busy} onClick={()=>setInbox(null)}>Fechar seleção</button>
      </div>}
    </div>}
    <div className="fiscal-privacy"><ShieldCheck size={15}/><span>Somente leitura. Não envia e-mails, não registra pagamentos e não transmite documentos fiscais.</span></div>
  </div>;
}
