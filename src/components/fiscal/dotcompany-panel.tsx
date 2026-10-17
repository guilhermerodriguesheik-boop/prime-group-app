"use client";
import {useState,useEffect} from "react";
import {CheckCircle2,PlugZap,ShieldAlert,RefreshCw,ClipboardCheck} from "lucide-react";
type ProductionResult={configured:boolean;authenticated:boolean;emitterLookup:"ok"|"denied"|"unavailable"|"not_checked";productionEnabled:boolean;status?:number;reason?:string;message?:string;issuer?:{verified:boolean;cteReady:boolean;mdfeReady:boolean;hasRntrc:boolean;hasCteIcMSConfig:boolean;numberingCteConfigured:boolean;reason:string}|null};
type CheckResult={configured?:boolean;connected?:boolean;environment?:string;
 reason?:string;message?:string};
type Insights={kind:string;cargo:string|null;local:Array<{cargo:string;attempt?:{status?:string;error_code?:string;idempotency_key?:string}|null}>;provider:{ok:boolean;httpStatus:number|null;error:string|null;items:Array<Record<string,unknown>>;summary:Record<string,unknown>};reconciled:boolean;warning:string};
type Preview={ready:boolean;invoiceCount:number;freightValue:number|null;
 goodsValue:number;missing:string[];canTransmit:boolean;notice:string};
export function DotcompanyPanel({drafts}:{drafts:{id:string;label:string}[]}){
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<CheckResult|null>(null);
 const [draftId,setDraftId]=useState(drafts[0]?.id||"");
 const [preview,setPreview]=useState<Preview|null>(null);
 const [error,setError]=useState("");
 const [production,setProduction]=useState<ProductionResult|null>(null);
 const [checkingProduction,setCheckingProduction]=useState(false);
 const [productionError,setProductionError]=useState("");
 const [insightKind,setInsightKind]=useState<"cte"|"mdfe"|"mdfe_pending"|"usage">("cte");
 const [cargo,setCargo]=useState("");
 const [insights,setInsights]=useState<Insights|null>(null);
 const [insightLoading,setInsightLoading]=useState(false);
 async function check(){
  setBusy(true);setError("");setResult(null);
  try{
   const r=await fetch("/api/fiscal/dotcompany/status",{cache:"no-store"});
   const v=await r.json() as CheckResult;
   setResult(v);
   if(!r.ok)setError(v.reason||"Erro ao consultar o provedor.");
  }catch{setError("Não foi possível alcançar o serviço de diagnóstico.")}
  finally{setBusy(false)}
 }
 useEffect(()=>{
  // Safe on-load check: GET /api/v1/usage and /emitters only, with no SEFAZ transmission.
  let active=true;
  const run=async()=>{
   setCheckingProduction(true);
   try{
    const response=await fetch("/api/fiscal/dotcompany/production-status",{cache:"no-store"});
    const info=await response.json() as ProductionResult;
    if(active){setProduction(info);setProductionError(info.reason||"");}
   }catch{if(active)setProductionError("Não foi possível verificar a produção automaticamente.");}
   finally{if(active)setCheckingProduction(false);}
  };
  void run();
  return ()=>{active=false;};
 },[]);
 async function checkProduction(){
  setCheckingProduction(true);
  setProductionError("");
  try{
   const r=await fetch("/api/fiscal/dotcompany/production-status",{cache:"no-store"});
   const v=await r.json() as ProductionResult;
   setProduction(v);
   if(v.reason)setProductionError(v.reason);
  }catch{
   setProduction(null);setProductionError("Não foi possível verificar a chave de produção.");
  }finally{setCheckingProduction(false)}
 }
 async function checkInsights(){
  setInsightLoading(true);setError("");setInsights(null);
  try{
   const params=new URLSearchParams({kind:insightKind});
   if(insightKind==="cte"&&cargo.trim())params.set("cargo",cargo.trim());
   const response=await fetch("/api/fiscal/dotcompany/insights?"+params.toString(),{cache:"no-store"});
   const value=await response.json() as Insights&{error?:string};
   if(!response.ok)throw Error(value.error||"Consulta fiscal indisponível.");
   setInsights(value);
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível consultar a DotCompany.");}
  finally{setInsightLoading(false);}
 }
 async function preflight(){
  if(!draftId)return;
  setBusy(true);setError("");setPreview(null);
  try{
   const r=await fetch("/api/fiscal/dotcompany/preflight",{
    method:"POST",headers:{"Content-Type":"application/json","x-prime-action":"dotcompany-preflight"},
    body:JSON.stringify({draftId}),
   });
   const v=await r.json() as Preview&{error?:string};
   if(!r.ok)throw Error(v.error||"Falha na pré-conferência.");
   setPreview(v);
  }catch(e){setError(e instanceof Error?e.message:"Falha ao conferir a carga.")}
  finally{setBusy(false)}
 }
 return <section className="fiscal-dotcompany card">
  <div className="fiscal-dotcompany-heading">
   <div><span className="fiscal-section-kicker">API FISCAL / NOVA INTEGRAÇÃO</span>
    <h3>Conexão de testes (Sandbox)</h3>
    <p>Esta área superior consulta apenas a chave de testes. A conexão de produção é verificada no bloco separado abaixo.</p>
   </div><span className="fiscal-gmail-state waiting">Somente este bloco: Sandbox</span>
  </div>
  <div className="fiscal-dotcompany-actions">
   <button className="button primary" type="button" onClick={check} disabled={busy}>
     <PlugZap size={15}/> {busy?"Verificando...":"Testar chave e conexão"}
   </button>
   <a href="https://erp.dotcompany.com.br/api-dev" target="_blank" rel="noopener noreferrer">Painel do emissor ↗</a>
  </div>
  {result?.connected&&<p className="fiscal-inline-alert" role="status"><CheckCircle2 size={16}/> {result.message||"API Sandbox autenticada."} A emissão fiscal real continua desabilitada até validação.</p>}
  {error&&<p role="alert" className="fiscal-inline-alert"><ShieldAlert size={16}/>{
    error==="INSUFFICIENT_API_SCOPE"?"Sandbox: chave sem permissão nas consultas de consumo e emissores. Na DotCompany, habilite usage.report ou emitter.list em Escopos.":error
   }</p>}
  <div className="fiscal-dotcompany-production">
   <div className="fiscal-dotcompany-heading">
    <div><span className="fiscal-section-kicker">SEFAZ / PRODUÇÃO</span>
      <h3>DotCompany — ambiente de PRODUÇÃO</h3>
      <p>Esta seção utiliza a chave dc_live_. Autenticação não significa emissão liberada: o perfil fiscal de CT-e deve estar pronto.</p>
    </div>
    <span className={"fiscal-gmail-state "+(production?.authenticated&&production.issuer?.cteReady?"connected":"waiting")}>
      {checkingProduction?"Consultando produção":production?.authenticated?
       production.issuer?.cteReady?"Produção: CT-e pronto":"Produção autenticada · CT-e bloqueado":
       production?"Produção não autenticada":"Produção: verificando"}
    </span>
   </div>
   <div className="fiscal-dotcompany-actions">
    <button className="button" type="button" disabled={checkingProduction} onClick={checkProduction}>
      <PlugZap size={15}/>{checkingProduction?"Validando...":"Verificar conexão de produção"}
    </button>
    <a href="https://erp.dotcompany.com.br/api-dev/keys" target="_blank" rel="noopener noreferrer">Gerar chave dc_live_ ↗</a>
   </div>
   {production&&<div className="fiscal-dotcompany-result" role="status">
    <strong>{production.authenticated?"Chave de produção autenticada":"Autenticação de produção ainda não comprovada"}</strong>
    <ul>
      <li>Credencial dc_live_: {production.configured?"cadastrada":"não cadastrada na Vercel"}</li>
      <li>Autenticação com DotCompany: {production.authenticated?"confirmada":"não comprovada pelos endpoints de consulta"}</li>
      <li>Consulta do emissor: {production.emitterLookup==="ok"?"endpoint acessível":production.emitterLookup==="denied"?"permissão insuficiente":production.emitterLookup==="unavailable"?"indisponível":"não realizada"}</li>
      <li>Permissão técnica de transmissão: {production.productionEnabled?"ativa, sujeita ao credenciamento do emissor":"desabilitada"}</li>
      <li>Emissor CT-e: {production.issuer?.cteReady?"pronto":"não pronto ou não confirmado"}</li>
      <li>Emissor MDF-e: {production.issuer?.mdfeReady?"pronto":"não pronto ou não confirmado"}</li>
      <li>RNTRC no perfil DotCompany: {production.issuer?.hasRntrc?"informado":"pendente ou não confirmado"}</li>
      <li>Configuração ICMS CT-e: {production.issuer?.hasCteIcMSConfig?"preenchida":"pendente ou não confirmada"}</li>
      <li>Numeração CT-e: {production.issuer?.numberingCteConfigured?"série encontrada na API":"a API não apresentou sequência modelo 57; confira o contador próprio do CT-e no cadastro, que pode não aparecer em numeracao[]"}</li>
    </ul>
    {production.issuer&&!production.issuer.cteReady&&<p role="alert">
      <strong>Bloqueio da DotCompany:</strong> {production.issuer.reason} Não tente emitir CT-e aqui antes da regularização.
      <a href="https://dotcompany.com.br/suporte.html" target="_blank" rel="noopener noreferrer"> Suporte oficial ↗</a>
    </p>}
    <small>{production.message||"A confirmação de conexão não equivale a credenciamento SEFAZ nem a CT-e autorizado."}</small>
   </div>}
   {productionError&&<div className="fiscal-inline-alert" role="alert">
    <ShieldAlert size={16}/>
    <span>{productionError}
     {production?.status===403&&" Abra a chave de PRODUÇÃO na DotCompany → Escopos e habilite usage.report e emitter.list. A falta dessas permissões impede o diagnóstico, mas não comprova que o token seja inválido."}
    </span>
   </div>}
  </div>
  <div className="fiscal-dotcompany-production">
   <div className="fiscal-dotcompany-heading">
    <div><span className="fiscal-section-kicker">CONEXÃO DIRETA / SOMENTE CONSULTA</span>
      <h3>Diagnóstico DotCompany</h3>
      <p>Consulte os CT-e e MDF-e sem transmitir, cancelar ou alterar numeração.</p>
    </div>
   </div>
   <div className="fiscal-dotcompany-actions">
    <select aria-label="Tipo de consulta DotCompany" value={insightKind}
      onChange={e=>{setInsightKind(e.target.value as typeof insightKind);setInsights(null);}}>
      <option value="cte">Histórico CT-e</option>
      <option value="mdfe">Histórico MDF-e</option>
      <option value="mdfe_pending">MDF-e para encerrar</option>
      <option value="usage">Consumo e saldo</option>
    </select>
    {insightKind==="cte"&&<input aria-label="Número da carga" placeholder="Carga (ex.: 029988)"
      value={cargo} onChange={e=>setCargo(e.target.value.replace(/[^0-9]/g,"").slice(0,12))}/>}
    <button type="button" className="button" onClick={()=>void checkInsights()} disabled={insightLoading}>
      <RefreshCw size={15}/>{insightLoading?"Consultando...":"Consultar DotCompany"}
    </button>
   </div>
   {insights&&<div className="fiscal-dotcompany-result" role="status">
     <strong>{insights.provider.ok?"Consulta recebida da DotCompany":"Não foi possível obter a listagem externa"}</strong>
     {insights.provider.error&&<p>{insights.provider.error}</p>}
     {insights.local.map((item,i)=><p key={i}>Carga {item.cargo} · tentativa local: {item.attempt?.status||"não registrada"} · {item.attempt?.error_code||"sem erro registrado"}</p>)}
     {insights.provider.items.length>0?
      <ul>{insights.provider.items.map((item,i)=><li key={i}>{[item.numero||item.number||item.id||item.cte_id||item.mdfe_id||"Documento",
       item.status||item.situacao||"situação não informada",item.chave_acesso||""].filter(Boolean).join(" · ")}</li>)}</ul>:
      <p>Nenhum documento foi retornado nesta consulta. Isso não comprova ausência de emissão.</p>}
     <small>{insights.warning}</small>
   </div>}
  </div>
  {drafts.length>0&&<div className="fiscal-dotcompany-preflight">
    <label>Verificar requisitos reais de uma carga (sem emitir)
     <select value={draftId} onChange={e=>{setDraftId(e.target.value);setPreview(null)}}>
      {drafts.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
     </select>
    </label>
    <button className="button" type="button" disabled={busy||!draftId} onClick={preflight}><ClipboardCheck size={15}/> Pré-conferir CT-e</button>
   </div>}
  {preview&&<div className="fiscal-dotcompany-result" role="status">
    <strong>{preview.invoiceCount} NF-e vinculada(s) — frete {preview.freightValue===null?"não informado":preview.freightValue.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong>
    <p>Mercadorias: {preview.goodsValue.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} (não confundir com o frete).</p>
    <strong>{preview.ready?"Conferência concluída — confirme no painel Revisar / enviar.":"Pendências para emissão real:"}</strong>
    <ul>{preview.missing.map((m,i)=><li key={i}>{m}</li>)}</ul>
    <small>{preview.notice}</small>
   </div>}
 </section>;
}
