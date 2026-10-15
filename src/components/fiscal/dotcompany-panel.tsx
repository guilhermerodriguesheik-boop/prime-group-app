"use client";
import {useState} from "react";
import {CheckCircle2,PlugZap,ShieldAlert,RefreshCw,ClipboardCheck} from "lucide-react";
type ProductionResult={configured:boolean;authenticated:boolean;emitterLookup:"ok"|"denied"|"unavailable"|"not_checked";productionEnabled:boolean;status?:number;reason?:string;message?:string};
type CheckResult={configured?:boolean;connected?:boolean;environment?:string;
 reason?:string;message?:string};
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
 async function checkProduction(){
  setCheckingProduction(true);
  setError("");
  try{
   const r=await fetch("/api/fiscal/dotcompany/production-status",{cache:"no-store"});
   const v=await r.json() as ProductionResult;
   setProduction(v);
   if(!r.ok&&v.reason)setError(v.reason);
  }catch{
   setProduction(null);setError("Não foi possível verificar a chave de produção.");
  }finally{setCheckingProduction(false)}
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
    <h3>DotCompany</h3>
    <p>Conexão Sandbox para testes de CT-e e MDF-e. Não emite documentos fiscais reais.</p>
   </div><span className="fiscal-gmail-state waiting">Homologação</span>
  </div>
  <div className="fiscal-dotcompany-actions">
   <button className="button primary" type="button" onClick={check} disabled={busy}>
     <PlugZap size={15}/> {busy?"Verificando...":"Testar chave e conexão"}
   </button>
   <a href="https://erp.dotcompany.com.br/api-dev" target="_blank" rel="noopener noreferrer">Painel do emissor ↗</a>
  </div>
  {result?.connected&&<p className="fiscal-inline-alert" role="status"><CheckCircle2 size={16}/> {result.message||"API Sandbox autenticada."} A emissão fiscal real continua desabilitada até validação.</p>}
  {error&&<p role="alert" className="fiscal-inline-alert"><ShieldAlert size={16}/>{error}</p>}
  <div className="fiscal-dotcompany-production">
   <div className="fiscal-dotcompany-heading">
    <div><span className="fiscal-section-kicker">SEFAZ / PRODUÇÃO</span>
      <h3>Conexão fiscal para emissão real</h3>
      <p>Chave de produção separada da chave de teste. Consultar não emite documentos.</p>
    </div>
    <span className="fiscal-gmail-state waiting">Não transmite automaticamente</span>
   </div>
   <div className="fiscal-dotcompany-actions">
    <button className="button" type="button" disabled={checkingProduction} onClick={checkProduction}>
      <PlugZap size={15}/>{checkingProduction?"Validando...":"Verificar conexão de produção"}
    </button>
    <a href="https://erp.dotcompany.com.br/api-dev/keys" target="_blank" rel="noopener noreferrer">Gerar chave dc_live_ ↗</a>
   </div>
   {production&&<div className="fiscal-dotcompany-result" role="status">
    <strong>{production.authenticated?"Chave de produção autenticada":"Aguardando autenticação de produção"}</strong>
    <ul>
      <li>Credencial dc_live_: {production.configured?"cadastrada":"não cadastrada na Vercel"}</li>
      <li>Autenticação com DotCompany: {production.authenticated?"confirmada":"não confirmada"}</li>
      <li>Consulta do emissor: {production.emitterLookup==="ok"?"endpoint acessível":production.emitterLookup==="denied"?"permissão insuficiente":production.emitterLookup==="unavailable"?"indisponível":"não realizada"}</li>
      <li>Transmissão CT-e: {production.productionEnabled?"habilitada mediante conferência completa e confirmação":"desabilitada até conclusão da homologação fiscal"}</li>
    </ul>
    <small>{production.message||"A confirmação de conexão não equivale a credenciamento SEFAZ nem a CT-e autorizado."}</small>
   </div>}
  </div>
  {drafts.length>0&&<div className="fiscal-dotcompany-preflight">
    <label>Conferir uma carga sem emitir
     <select value={draftId} onChange={e=>{setDraftId(e.target.value);setPreview(null)}}>
      {drafts.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
     </select>
    </label>
    <button className="button" type="button" disabled={busy||!draftId} onClick={preflight}><ClipboardCheck size={15}/> Pré-conferir CT-e</button>
   </div>}
  {preview&&<div className="fiscal-dotcompany-result" role="status">
    <strong>{preview.invoiceCount} NF-e vinculada(s) — frete {preview.freightValue===null?"não informado":preview.freightValue.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong>
    <p>Mercadorias: {preview.goodsValue.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} (não confundir com o frete).</p>
    <strong>Antes de emitir:</strong>
    <ul>{preview.missing.map((m,i)=><li key={i}>{m}</li>)}</ul>
    <small>{preview.notice}</small>
   </div>}
 </section>;
}
