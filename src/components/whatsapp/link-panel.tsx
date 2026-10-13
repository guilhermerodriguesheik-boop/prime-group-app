"use client";

import { useEffect, useState } from "react";

type Status = {
  linked: boolean; maskedPhone: string | null; pendingUntil: string | null;
  connectedAt: string | null; providerConfigured: boolean; provider: "evolution" | "meta";
};

export function WhatsAppLinkPanel() {
  const [state,setState] = useState<Status|null>(null);
  const [code,setCode] = useState("");
  const [expires,setExpires] = useState("");
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  async function refresh() {
    const response=await fetch("/api/whatsapp/link",{cache:"no-store"});
    const result=await response.json() as Status&{error?:string};
    if (!response.ok) throw new Error(result.error||"Falha ao consultar.");
    setState(result);
  }
  useEffect(()=>{
    let active=true;
    fetch("/api/whatsapp/link",{cache:"no-store"}).then(async r=>{
      const j=await r.json() as Status;
      if(active && r.ok)setState(j);
    }).catch(()=>undefined);
    return ()=>{active=false};
  },[]);

  async function create() {
    setLoading(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/whatsapp/link",{method:"POST"});
      const result=await response.json() as {error?:string;code?:string;expiresAt?:string};
      if(!response.ok||!result.code)throw new Error(result.error||"Falha ao gerar código.");
      setCode(result.code);setExpires(result.expiresAt||"");
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Falha de rede")}
    finally{setLoading(false)}
  }
  async function disconnect() {
    setLoading(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/whatsapp/link",{method:"DELETE"});
      if(!response.ok)throw new Error("Não foi possível desvincular.");
      setCode("");setExpires("");setNotice("Número desvinculado. Mensagens futuras não acessarão os dados desta conta.");
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Falha de rede")}
    finally{setLoading(false)}
  }
  const message=code?"VINCULAR "+code:"";
  const readyToLink=Boolean(state?.providerConfigured);
  const viaQr = state?.provider === "evolution";
  return (
    <div className="card" style={{display:"grid",gap:12}}>
      <h3>Vincular meu WhatsApp ao Prime Finance</h3>
      <p className="metric-foot">
        Seu número só terá acesso às contas depois que enviar um código temporário pelo WhatsApp
        para o número do canal conectado. Outros números não podem consultar seus dados.
      </p>
      <p>
        {state?.linked
          ? "Número vinculado: "+state.maskedPhone
          : readyToLink
            ? "Canal configurado ("+(viaQr?"QR Code":"Meta")+"). Falta confirmar o vínculo do seu número."
            : (viaQr?"Aguardando conexão e credenciais do serviço Evolution (QR Code).":
               "Aguardando credenciais e ativação do número comercial na Meta.")}
      </p>
      {state?.linked && <span className="badge green">Número vinculado</span>}
      {!state?.linked && (
        <button className="button primary" type="button" onClick={()=>void create()}
          disabled={loading||!readyToLink}>
          {loading?"Aguarde...":"Gerar código de vínculo"}
        </button>
      )}
      {code && (
        <div className="notice">
          <div>Código válido por 15 minutos. Envie a mensagem abaixo para o número {viaQr?"conectado pelo QR Code":"comercial conectado à Meta"}:</div>
          <p style={{fontSize:"1.3rem",fontWeight:700,letterSpacing:1,margin:"12px 0"}}>{message}</p>
          <button className="button" type="button" onClick={()=>
            navigator.clipboard.writeText(message).then(()=>setNotice("Mensagem copiada.")).catch(()=>setError("Não foi possível copiar."))}>
            Copiar mensagem
          </button>
          {expires && <p className="metric-foot">Expira: {new Date(expires).toLocaleString("pt-BR")}</p>}
        </div>
      )}
      {state?.pendingUntil && !code && !state.linked && (
        <p className="metric-foot">Existe código pendente. Gere outro se precisar; o anterior será substituído.</p>
      )}
      <div className="quick">
        <button type="button" className="button" onClick={()=>{
          setLoading(true);refresh().catch((e)=>setError(String(e))).finally(()=>setLoading(false))
        }} disabled={loading}>Verificar vínculo</button>
        {state?.linked && <button className="button" type="button"
          disabled={loading} onClick={()=>void disconnect()}>Desvincular número</button>}
      </div>
      {notice && <p className="metric-foot">{notice}</p>}
      {error && <p className="metric-foot" style={{color:"#ff9da8"}}>{error}</p>}
      <p className="metric-foot">
        Depois de ativado: texto, áudio, foto e XML/PDF; informações incompletas viram registros
        parciais. Recebimentos/contas só são gravados como pagamentos quando houver dados suficientes.
        O canal QR Code é não oficial e pode sofrer desconexões ou bloqueio do número. O canal Meta tem cobrança própria.
      </p>
    </div>
  );
}
