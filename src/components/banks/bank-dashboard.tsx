"use client";

import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Workspace={id:string;kind:string;name:string};
type Connection={id:string;provider:string;workspace_id:string;display_name:string;institution_name:string|null;
  account_kind:string;status:string;last_synced_at:string|null;last_error:string|null};
type BankAccount={id:string;connection_id:string;display_name:string;account_last4:string|null;
  kind:string;currency:string;balance:number|null;balance_updated_at:string|null};
type Statement={id:string;bank_account_id:string;occurred_on:string;description:string;
  amount:number;direction:"credit"|"debit";provider_status:string;review_status:string;category:string|null};
type Data={configured:boolean;mode:string;workspaces:Workspace[];connections:Connection[];
  accounts:BankAccount[];transactions:Statement[]};
type WidgetOptions={
  connectToken:string;includeSandbox:boolean;
  selectedConnectorId?:number;connectorIds?:number[];products?:string[];
  onSuccess:(data:{item:{id:string}})=>void;
  onError:(error:{message:string})=>void;
  onClose?:()=>void;
};
type WidgetCtor=new (args:WidgetOptions)=>{init:()=>void};
const banks=[
  {name:"Itaú Empresas",kind:"business",slug:"itau"},
  {name:"Bradesco Empresas",kind:"business",slug:"bradesco"},
  {name:"Inter Pessoal",kind:"personal",slug:"inter"},
] as const;
const money=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);
const date=(value:string|null)=>value?new Date(value).toLocaleString("pt-BR"):"Não sincronizado";

export function BankDashboard(){
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const [bank,setBank]=useState(0);
  const [manualId,setManualId]=useState("");
  const [sdkReady,setSdkReady]=useState(false);
  const attempted=useRef(new Set<string>());
  const selected=banks[bank];
  const workspace=data?.workspaces.find(w=>w.kind===(selected.kind==="business"?"prime":"personal"));
  const accountMap=useMemo(()=>new Map((data?.accounts||[]).map(a=>[a.id,a])),[data]);
  const load=useCallback(async()=>{
    try{
      const result=await fetch("/api/banks",{cache:"no-store"});
      const payload=await result.json();
      if(!result.ok)throw new Error(payload.error||"Falha ao consultar dados.");
      setData(payload);
    }catch(err){setNotice(err instanceof Error?err.message:"Falha ao carregar.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{const timer=window.setTimeout(()=>{void load();},0);return ()=>window.clearTimeout(timer);},[load]);
  async function post(payload:Record<string,unknown>){
    const r=await fetch("/api/banks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const v=await r.json();
    if(!r.ok)throw new Error(v.error||"Falha na integração.");
    return v;
  }
  async function attach(itemId:string){
    if(!workspace)throw new Error("Cadastre primeiro um ambiente financeiro correspondente.");
    const result=await post({action:"attach",itemId,workspaceId:workspace.id,kind:selected.kind,label:selected.name});
    setNotice("Conexão cadastrada. Buscando o primeiro extrato...");
    await load();
    await sync(result.id,true);
  }
  async function connect(){
    if(!workspace){setNotice("Ambiente não encontrado. Cadastre Prime ou Pessoal primeiro.");return;}
    if(!data?.configured){setNotice("Faltam credenciais Pluggy privadas na Vercel.");return;}
    const pluggy=(window as Window & {PluggyConnect?:WidgetCtor}).PluggyConnect;
    if(!sdkReady||!pluggy){setNotice("Carregando a tela de autorização do provedor. Tente em instantes.");return;}
    setBusy("connecting");setNotice("");
    try{
      const r=await fetch("/api/banks/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId:workspace.id})});
      const payload=await r.json();
      if(!r.ok)throw new Error(payload.error||"Falha ao iniciar.");
      const widget=new pluggy({
        connectToken:payload.accessToken,includeSandbox:false,
        ...(payload.connectorId ? {selectedConnectorId:payload.connectorId,connectorIds:[payload.connectorId]} : {}),
        products:["ACCOUNTS","CREDIT_CARDS","TRANSACTIONS"],
        onSuccess:async ({item})=>{
          setBusy("attach");
          try{await attach(item.id);}catch(e){setNotice(e instanceof Error?e.message:"Erro ao vincular conta.");}
          finally{setBusy("");}
        },
        onError:(e)=>{setNotice(e.message||"Autorização não concluída.");setBusy("");},
        onClose:()=>{setBusy("");}
      });
      widget.init();
    }catch(e){setNotice(e instanceof Error?e.message:"Falha ao abrir autorização.");setBusy("");}
  }
  async function sync(id:string,force=false){
    setBusy(id);
    try{
      const response=await post({action:"sync",id,force});
      setNotice(response.cached?"Extrato atualizado recentemente.":"Extrato atualizado; lançamentos aguardam revisão.");
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:"Falha ao sincronizar.");await load();}
    finally{setBusy("");}
  }
  async function toggle(id:string,paused:boolean){
    setBusy(id);
    try{
      await post({action:paused?"resume":"pause",id});
      setNotice(paused?"Sincronização reativada.":"Sincronização pausada neste aplicativo. O consentimento bancário deve ser revogado no provedor.");
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:"Falha ao atualizar.");}
    finally{setBusy("");}
  }
  async function review(id:string,status:"ignored"|"pending"){
    setBusy(id);
    try{await post({action:"review",id,status});await load();}
    catch(e){setNotice(e instanceof Error?e.message:"Falha na revisão.");}
    finally{setBusy("");}
  }
  useEffect(()=>{
    if(!data?.configured)return;
    for(const c of data.connections){
      if(c.provider!=="pluggy")continue;
      if(c.status!=="connected"&&c.status!=="attention")continue;
      if(c.last_synced_at && Date.now()-Date.parse(c.last_synced_at)<24*3600_000)continue;
      if(attempted.current.has(c.id))continue;
      attempted.current.add(c.id);
      window.setTimeout(()=>{void sync(c.id);},0);
      break;
    }
    // Synchronize on app entry only. Never poll continuously or bypass consent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data?.configured,data?.connections]);

  const total=(data?.accounts||[]).filter(a=>a.kind==="BANK"&&a.currency==="BRL")
    .reduce((sum,a)=>sum+Number(a.balance||0),0);
  const pending=(data?.transactions||[]).filter(t=>t.review_status==="pending");
  return <div>
    <Script
      src="https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js"
      strategy="afterInteractive"
      onReady={()=>setSdkReady(true)}
      onError={()=>setNotice("Não foi possível abrir a autorização. Tente recarregar ou vincule o item já criado no Dashboard Pluggy.")}
    />
    <div className="grid grid-3" style={{marginBottom:16}}>
      <div className="card"><div className="metric-label">Contas conectadas</div><div className="metric-value">{data?.accounts.length||0}</div><div className="metric-foot">Apenas contas realmente autorizadas</div></div>
      <div className="card"><div className="metric-label">Saldos bancários consultados</div><div className="metric-value">{money(total)}</div><div className="metric-foot">Separados do caixa contábil para evitar duplicidade</div></div>
      <div className="card"><div className="metric-label">Movimentos para conciliar</div><div className="metric-value">{pending.length}</div><div className="metric-foot">Extrato importado não é lançamento confirmado</div></div>
    </div>
    {notice&&<div className="notice" role="status" style={{marginBottom:16}}>{notice}</div>}
    <div className="card" style={{marginBottom:18}}>
      <h3>Conectar suas instituições</h3>
      <p className="metric-foot">{data?.mode==="personal-allowed" ? "Conecte seus bancos no Meu Pluggy e autorize aqui o acesso aos seus próprios dados. Escolha o banco correspondente para separar Prime e Pessoal." : "Escolha o banco, autorize seus dados no fluxo oficial da instituição e vincule ao ambiente correto."}</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"14px 0"}}>
        {banks.map((b,i)=><button key={b.slug} className={"button "+(bank===i?"":"ghost")}
          type="button" disabled={!!busy} onClick={()=>{setBank(i);setNotice("");}}>{b.name}</button>)}
      </div>
      <p className="metric-foot">Destino: <b>{workspace?.name||"Ambiente não cadastrado"}</b> · {selected.kind==="business"?"Pessoa jurídica":"Pessoa física"}</p>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginTop:12}}>
        <button type="button" className="button" disabled={!!busy||loading||!data?.configured||!workspace}
          onClick={()=>void connect()}>{busy==="connecting"?"Abrindo autorização...":data?.mode==="personal-allowed"?"Conectar pelo Meu Pluggy":"Conectar com Open Finance"}</button>
        <span className="metric-foot">{data?.configured?"Integração técnica configurada":"Aguardando credenciais do provedor"}</span>
      </div>
      <div className="notice" style={{marginTop:18}}>
        <b>Sem mensalidade de Open Finance: importar extrato OFX</b>
        <p className="metric-foot">Exporte o extrato OFX do banco pelo internet banking. O arquivo será analisado e suas movimentações entrarão em conferência, sem lançamentos automáticos no caixa.</p>
        <form onSubmit={async e=>{
          e.preventDefault();
          const form=new FormData(e.currentTarget);
          const file=form.get("file");
          if(!(file instanceof File))return;
          form.set("bank",selected.slug);
          setBusy("ofx");setNotice("");
          try{
            const response=await fetch("/api/banks/import",{method:"POST",body:form});
            const body=await response.json();
            if(!response.ok)throw new Error(body.error||"Falha ao importar arquivo.");
            setNotice(body.imported+" movimentações lidas de "+body.bank+". Revise antes de conciliar.");
            await load();
          }catch(err){setNotice(err instanceof Error?err.message:"Falha ao importar.");}
          finally{setBusy("");}
        }}>
          <input type="file" name="file" accept=".ofx,.qfx" required aria-label="Selecionar extrato OFX"
            style={{padding:"8px 0",marginRight:10,maxWidth:"100%"}}/>
          <button type="submit" className="button ghost" disabled={!!busy||!workspace}>Importar OFX</button>
        </form>
      </div>
      <details style={{marginTop:16}}> 
        <summary>Já tenho um item da aplicação demo no Dashboard Pluggy</summary>
        <p className="metric-foot">Use o ID do item criado pelo conector Meu Pluggy na aplicação demo do Dashboard. O ID da conexão original no site Meu Pluggy é diferente. Vincule um item por banco, escolhendo a instituição acima.</p>
        <form onSubmit={async e=>{e.preventDefault();setBusy("manual");try{await attach(manualId.trim());setManualId("");}catch(err){setNotice(err instanceof Error?err.message:"Falha no cadastro.");}finally{setBusy("");}}}>
          <input aria-label="Item ID da Pluggy" placeholder="UUID do item bancário" value={manualId} onChange={e=>setManualId(e.target.value)}
            style={{padding:10,maxWidth:"100%",width:380,marginRight:8}}/>
          <button className="button ghost" type="submit" disabled={!!busy||!data?.configured||!workspace}>Vincular item</button>
        </form>
      </details>
    </div>
    <div className="card" style={{marginBottom:18}}>
      <h3>Suas conexões e saldos</h3>
      {loading?<p>Carregando...</p>:data?.connections.length===0?<p className="metric-foot">Nenhuma conta conectada. Não há extratos reais para importar até você autorizar os bancos.</p>:null}
      {data?.connections.map(c=><div key={c.id} style={{padding:"12px 0",borderTop:"1px solid var(--line)"}}>
        <strong>{c.display_name}</strong><span className="metric-foot"> · {data.workspaces.find(w=>w.id===c.workspace_id)?.name} · {c.provider==="manual"?"Arquivo OFX":"Pluggy"} · {c.status}</span>
        <div className="metric-foot">Última sincronização: {date(c.last_synced_at)}</div>
        {c.last_error&&<div className="warning" style={{fontSize:12}}>Erro: {c.last_error}</div>}
        {data.accounts.filter(a=>a.connection_id===c.id).map(a=><div className="metric-foot" key={a.id}>
          {a.display_name} {a.account_last4&&"· final "+a.account_last4} · Saldo: {a.balance===null?"indisponível":money(a.balance)} {a.kind==="CREDIT"?"(cartão/crédito)":""}
        </div>)}
        <div style={{display:"flex",gap:8,marginTop:10}}>
          {c.provider==="pluggy"&&<button className="button ghost" type="button" disabled={!!busy||c.status==="disconnected"}
            onClick={()=>void sync(c.id,true)}>{busy===c.id?"Atualizando...":"Atualizar extrato"}</button>}
          <button className="button ghost" type="button" disabled={!!busy}
            onClick={()=>void toggle(c.id,c.status==="disconnected")}>
            {c.status==="disconnected"?"Reativar":"Pausar neste app"}</button>
        </div>
      </div>)}
    </div>
    <div className="card">
      <h3>Extrato para conferência</h3>
      <p className="metric-foot">Os movimentos abaixo são importados em modo de leitura. Revisar não altera caixa, não dá baixa em boletos e não executa Pix.</p>
      <div className="table-wrap"><table><thead><tr><th>Data</th><th>Conta</th><th>Descrição</th><th>Entrada / saída</th><th>Conferência</th></tr></thead>
      <tbody>
      {(data?.transactions||[]).map(t=><tr key={t.id}>
        <td>{new Date(t.occurred_on+"T12:00:00").toLocaleDateString("pt-BR")}</td>
        <td>{accountMap.get(t.bank_account_id)?.display_name||"Conta"}</td>
        <td>{t.description}</td><td>{t.direction==="credit"?"+":"−"} {money(t.amount)}</td>
        <td>{t.review_status==="matched"?"Conciliada":
          <button type="button" className="button ghost" disabled={!!busy}
          onClick={()=>void review(t.id,t.review_status==="ignored"?"pending":"ignored")}>
            {t.review_status==="ignored"?"Reabrir":"Ignorar na conferência"}</button>}</td>
      </tr>)}
      {!data?.transactions.length&&<tr><td colSpan={5}>Nenhum movimento importado.</td></tr>}
      </tbody></table></div>
    </div>
  </div>;
}
