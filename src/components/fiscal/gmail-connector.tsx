"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Props={connected:boolean;ready:boolean;lastSync:string|null;lastError:string|null};
export function GmailConnector({connected,ready,lastSync,lastError}:Props){
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
      setMessage("Lidos: "+data.scanned+" e-mails; cargas importadas: "+data.imported+
        "; NF-es: "+data.invoices+"; pendências: "+data.errors+
        ". Os documentos ficam em rascunho.");
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Falha na sincronização.");}
    finally{setBusy(false);}
  }
  return <div className="card" style={{display:"grid",gap:12,maxWidth:740}}>
    <h3>Ortobom — importar direto do Gmail</h3>
    <p>Conta: lgtransporteelogistica@gmail.com. Importa XML, número da carga, CIOT e frete,
      agrupa várias NF-es na mesma carga e evita importações repetidas.</p>
    <div className="record-toolbar">
      {ready&&<a className="button" href="/api/fiscal/gmail/connect">{connected?"Reconectar Gmail":"Conectar Gmail uma vez"}</a>}
      {!ready&&<p className="notice">Importação automática ainda não configurada no servidor. Os formulários de XML continuam disponíveis.</p>}
      <button className="button" type="button" disabled={!connected||!ready||busy} onClick={sync}>
        {busy?"Lendo mensagens...":"Importar e-mails agora"}
      </button>
    </div>
    <p className="metric-foot">{connected?"Gmail conectado.":"Aguardando autorização Google no Prime Finance."}
      {lastSync?" Última sincronização: "+new Date(lastSync).toLocaleString("pt-BR"):""}</p>
    {lastError&&<p role="status" className="notice">Verificar: {lastError}</p>}
    {message&&<p role="status">{message}</p>}
    <p className="metric-foot">Leitura apenas: não envia nem apaga e-mails, não registra pagamento
      e não transmite documento fiscal. Cada carga precisa de conferência antes de emitir.</p>
  </div>;
}
