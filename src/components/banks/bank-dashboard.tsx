"use client";

import Script from "next/script";
import { classifyBankMovement } from "@/app/actions/premium";
import {BankMovementDestination,bankAreaLabels,type BankArea} from "@/components/banks/bank-movement-destination";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronDown,
  CircleAlert, Clock3, CreditCard, FileUp, Landmark, LockKeyhole,
  Plus, RefreshCw, ShieldCheck, Trash2, Wallet, X,
} from "lucide-react";

type Workspace={id:string;kind:string;name:string};
type Connection={id:string;provider:string;workspace_id:string;display_name:string;institution_name:string|null;
  account_kind:string;status:string;last_synced_at:string|null;provider_last_updated_at:string|null;
  last_new_transaction_count:number;last_scanned_transaction_count:number;
  webhook_check_at:string|null;webhook_check_status:"not_checked"|"verified"|"failed";webhook_check_error:string|null;
  last_error:string|null;archived_at:string|null};
type BankAccount={id:string;connection_id:string;display_name:string;account_last4:string|null;
  kind:string;currency:string;balance:number|null;balance_updated_at:string|null};
type Statement={id:string;bank_account_id:string;occurred_on:string;description:string;
  amount:number;direction:"credit"|"debit";provider_status:string;review_status:string;category:string|null};
type Data={configured:boolean;mode:string;archivedView:boolean;workspaces:Workspace[];
  connections:Connection[];accounts:BankAccount[];transactions:Statement[];classifications:{bank_transaction_id:string;destination:string;category:string|null}[]};
type WidgetOptions={
  connectToken:string;includeSandbox:boolean;updateItem?:string;selectedConnectorId?:number;connectorIds?:number[];products?:string[];
  onSuccess:(data:{item:{id:string}})=>void;onError:(error:{message:string})=>void;onClose?:()=>void;
};
type WidgetCtor=new (args:WidgetOptions)=>{init:()=>void};
const banks=[
  {name:"Itaú Empresas",kind:"business",slug:"itau"},
  {name:"Bradesco Empresas",kind:"business",slug:"bradesco"},
  {name:"Inter Pessoal",kind:"personal",slug:"inter"},
] as const;
type BankSlug=typeof banks[number]["slug"];
type Preview={itemId:string;bank:BankSlug;detected:BankSlug|null;accounts:{name:string;last4:string;type:string}[];mismatch:boolean};
const money=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n);
const date=(n:string|null)=>n?new Date(n).toLocaleString("pt-BR"):"Aguardando sincronização";
const bankName=(slug:BankSlug)=>banks.find(b=>b.slug===slug)?.name||slug;

export function BankDashboard(){
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const [reportMode,setReportMode]=useState("imported_today");
  const [reportBusy,setReportBusy]=useState(false);
  const [buttonTestBusy,setButtonTestBusy]=useState(false);
  const [bank,setBank]=useState<BankSlug>("itau");
  async function sendBankReport(){
   setReportBusy(true);setNotice("");
   try{
    const response=await fetch("/api/banks/report",{
     method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({mode:reportMode})
    });
    const result=await response.json() as {error?:string;status?:string};
    if(!response.ok)throw Error(result.error||"Não foi possível preparar o envio.");
    setNotice(result.status==="sent"?
     "Relatório enviado ao provedor WhatsApp. Confira seu telefone vinculado.":
     "Relatório colocado na fila do WhatsApp. Situação: "+(result.status||"aguardando")+
      ". Se a Evolution Go não responder, a rotina automática tentará novamente.");
   }catch(e){setNotice(e instanceof Error?e.message:"Falha ao enviar relatório.");}
   finally{setReportBusy(false);}
  }
  async function testBankButtons(){
   setButtonTestBusy(true);setNotice("");
   try{
    const response=await fetch("/api/banks/test-buttons",{method:"POST"});
    const result=await response.json() as {
     error?:string;status?:string;providerAccepted?:boolean;failed?:boolean;
     providerError?:string|null;capabilities?:{version?:string|null;healthy?:boolean;carouselAdvertised?:boolean;details?:string}
    };
    if(!response.ok)throw Error(result.error||"Falha ao testar os botões");
    setNotice(result.providerAccepted?
     "Cartão de teste aceito pela Evolution Go. Confira no WhatsApp se aparecem os três botões e clique em uma área.":
     "Cartão de teste "+(result.failed?"rejeitado":"aguardando envio")+
     " ("+(result.status||"pendente")+"). "+
     (result.providerError||"O servidor tentará novamente."))+
     " · Evolution Go: "+(result.capabilities?.version||"versão não informada pela instalação")+
     (result.capabilities?.carouselAdvertised?" · carrossel anunciado":" · suporte ao carrossel ainda não comprovado");
   }catch(error){setNotice(error instanceof Error?error.message:"Falha no envio de teste.");}
   finally{setButtonTestBusy(false);}
  }
  const [manualId,setManualId]=useState("");
  const [sdkReady,setSdkReady]=useState(false);
  const [showArchived,setShowArchived]=useState(false);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [previewApproved,setPreviewApproved]=useState(false);
  const [deleting,setDeleting]=useState<Connection|null>(null);
  const [deleteMode,setDeleteMode]=useState<"archive"|"remove">("archive");
  const [confirmName,setConfirmName]=useState("");
  const [search,setSearch]=useState("");
  const [filterWorkspace,setFilterWorkspace]=useState("all");
  const [filterDirection,setFilterDirection]=useState("all");
  const [filterStatus,setFilterStatus]=useState("all");
  const [filterArea,setFilterArea]=useState("all");
  const [startDate,setStartDate]=useState("");
  const [endDate,setEndDate]=useState("");
  const attempted=useRef(new Set<string>());
  const selected=banks.find(b=>b.slug===bank)!;
  const workspace=data?.workspaces.find(w=>w.kind===(selected.kind==="business"?"prime":"personal"));
  const activeConnections=useMemo(()=>data?.connections.filter(c=>!c.archived_at)||[],[data]);
  const archivedConnections=useMemo(()=>data?.connections.filter(c=>!!c.archived_at)||[],[data]);
  const visibleConnections=showArchived?archivedConnections:activeConnections;
  const accountMap=useMemo(()=>new Map((data?.accounts||[]).map(a=>[a.id,a])),[data]);
  const pendingVisible=(data?.transactions||[]).filter(t=>t.review_status==="pending").length;
  const classificationMap=new Map((data?.classifications||[]).map(c=>[c.bank_transaction_id,c]));

  const load=useCallback(async()=>{
    try{
      const response=await fetch("/api/banks"+(showArchived?"?archived=1":""),{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||"Não foi possível consultar os bancos.");
      setData(body);
    }catch(e){setNotice(e instanceof Error?e.message:"Não foi possível carregar.");}
    finally{setLoading(false);}
  },[showArchived]);
  useEffect(()=>{
    const timer=window.setTimeout(()=>{void load();},0);
    const interval=window.setInterval(()=>{if(document.visibilityState==="visible")void load();},120000);
    return ()=>{window.clearTimeout(timer);window.clearInterval(interval);};
  },[load]);
  async function post(payload:Record<string,unknown>){
    const r=await fetch("/api/banks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const body=await r.json();
    if(!r.ok)throw new Error(body.error||"Falha na integração bancária.");
    return body;
  }
  async function prepare(itemId:string,slug:BankSlug){
    setBusy("preview");setPreviewApproved(false);setNotice("");
    try{
      const body=await post({action:"preview",itemId,bank:slug});
      setPreview({itemId,bank:slug,detected:body.detected||null,accounts:body.accounts||[],mismatch:!!body.mismatch});
    }catch(e){setNotice(e instanceof Error?e.message:"Não foi possível conferir a conta.");}
    finally{setBusy("");}
  }
  async function confirmPreview(){
    if(!preview||!workspace||preview.mismatch||!previewApproved)return;
    setBusy("attach");
    try{
      const result=await post({action:"attach",bank:preview.bank,itemId:preview.itemId,workspaceId:workspace.id,confirmed:true});
      setPreview(null);
      setNotice("Banco vinculado. Buscando os extratos...");
      await load();
      await sync(result.id,true);
    }catch(e){setNotice(e instanceof Error?e.message:"Não foi possível vincular.");}
    finally{setBusy("");}
  }
  async function connect(){
    if(!workspace){setNotice("Crie o ambiente correspondente antes de conectar.");return;}
    if(!data?.configured){setNotice("Credenciais Pluggy não configuradas no servidor.");return;}
    const pluggy=(window as Window & {PluggyConnect?:WidgetCtor}).PluggyConnect;
    if(!sdkReady||!pluggy){setNotice("Aguarde o carregamento do conector e tente novamente.");return;}
    setBusy("connecting");setNotice("");
    const slug=bank;
    try{
      const response=await fetch("/api/banks/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId:workspace.id})});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.error||"Não foi possível iniciar.");
      const widget=new pluggy({
        connectToken:payload.accessToken,includeSandbox:false,
        ...(payload.connectorId?{selectedConnectorId:payload.connectorId,connectorIds:[payload.connectorId]}:{}),
        products:["ACCOUNTS","CREDIT_CARDS","TRANSACTIONS"],
        onSuccess:({item})=>{setBusy("");void prepare(item.id,slug);},
        onError:(e)=>{setNotice(e.message||"Autorização não concluída.");setBusy("");},
        onClose:()=>setBusy(""),
      });
      widget.init();
    }catch(e){setNotice(e instanceof Error?e.message:"Erro ao abrir autorização.");setBusy("");}
  }
  async function sync(id:string,force=false){
    setBusy(id);
    try{
      const result=await post({action:"sync",id,force});
      setNotice(result.cached
        ?"Consulta recente em cache: nenhum pedido de atualização foi enviado ao banco."
        :Number(result.newTransactions)>0
          ?Number(result.newTransactions)+" novo(s) lançamento(s) disponível(is) na Pluggy foram importados."
          :"Consulta concluída, mas não havia novos lançamentos disponíveis na Pluggy. O horário da consulta não é o da atualização do banco.");
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:"Falha ao atualizar extratos.");await load();}
    finally{setBusy("");}
  }
  async function toggle(c:Connection){
    setBusy(c.id);
    try{
      await post({action:c.status==="disconnected"?"resume":"pause",id:c.id});
      setNotice(c.status==="disconnected"?"Conexão reativada.":"Sincronização pausada apenas neste app. O consentimento bancário permanece ativo no provedor.");
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:"Não foi possível alterar.");}
    finally{setBusy("");}
  }
  function openDelete(c:Connection){
    setDeleting(c);setDeleteMode(c.archived_at?"remove":"archive");setConfirmName("");
  }
  async function removeConnection(){
    if(!deleting||confirmName!==deleting.display_name)return;
    setBusy("remove");
    try{
      await post({action:deleteMode,id:deleting.id,confirmation:confirmName});
      setNotice(deleteMode==="archive"
        ?"Conexão desvinculada. Histórico mantido em Arquivadas. O consentimento no provedor não foi revogado."
        :"Conexão e extratos associados excluídos do Prime Finance. O consentimento no provedor não foi revogado.");
      setDeleting(null);setConfirmName("");
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:"Não foi possível remover.");}
    finally{setBusy("");}
  }
  async function review(id:string,status:"ignored"|"pending"){
    setBusy(id);
    try{await post({action:"review",id,status});await load();}
    catch(e){setNotice(e instanceof Error?e.message:"Falha ao revisar.");}
    finally{setBusy("");}
  }
  useEffect(()=>{
    if(!data?.configured||showArchived)return;
    const c=data.connections.find(c=>!c.archived_at&&c.provider==="pluggy"
      &&(c.status==="connected"||c.status==="attention")
      &&(!c.last_synced_at||Date.now()-Date.parse(c.last_synced_at)>=24*3600_000)
      &&!attempted.current.has(c.id));
    if(!c)return;
    attempted.current.add(c.id);
    const timer=window.setTimeout(()=>{void sync(c.id);},0);
    return ()=>window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data?.configured,data?.connections,showArchived]);

  const filteredTransactions=(data?.transactions||[]).filter(t=>{
    const account=accountMap.get(t.bank_account_id);
    const connection=data?.connections.find(c=>c.id===account?.connection_id);
    if(filterWorkspace!=="all"&&connection?.account_kind!==filterWorkspace)return false;
    if(filterDirection!=="all"&&t.direction!==filterDirection)return false;
    if(filterStatus!=="all"&&t.review_status!==filterStatus)return false;
    const bucket=classificationMap.get(t.id)?.destination||"pending";
    if(filterArea!=="all"&&bucket!==filterArea)return false;
    if(startDate&&t.occurred_on<startDate)return false;
    if(endDate&&t.occurred_on>endDate)return false;
    if(search&&!((t.description+" "+(account?.display_name||"")).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))))return false;
    return true;
  });
  async function syncAll(){
    const toSync=activeConnections.filter(c=>c.provider==="pluggy"&&c.status!=="disconnected");
    if(!toSync.length){setNotice("Nenhuma conexão ativa disponível para atualizar.");return;}
    setBusy("all");
    let ok=0;
    for(const c of toSync){
      try{await post({action:"sync",id:c.id,force:true});ok++;}
      catch(e){setNotice("Algumas conexões não atualizaram: "+(e instanceof Error?e.message:"Erro desconhecido"));}
    }
    await load();setBusy("");
    if(ok===toSync.length)setNotice("Consulta de "+ok+" conexão(ões) concluída. O Meu Pluggy atualiza os bancos em seu próprio ciclo; consulte a data de origem abaixo.");
  }
  const latest=activeConnections.map(c=>c.last_synced_at).filter((v):v is string=>!!v).sort().at(-1)||null;
  const providerLatest=activeConnections.map(c=>c.provider_last_updated_at)
    .filter((v):v is string=>!!v).sort().at(-1)||null;
  return <div className="bank-page">
    <Script src="https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js" strategy="afterInteractive"
      onReady={()=>setSdkReady(true)}
      onError={()=>setNotice("A tela de autorização não carregou. Atualize a página ou vincule pelo ID da aplicação demo.")}/>
    <section className="bank-hero">
      <div>
        <div className="bank-overline">Open Finance • Leitura segura</div>
        <h2>Suas contas, em um só lugar</h2>
        <p>Consulte saldos e movimentações mantendo a Prime Group separada das finanças pessoais. 
        O Meu Pluggy atualiza a origem no próprio ciclo diário; o Prime Finance importa os dados recebidos automaticamente e por esta tela.</p>
      </div>
      <div className="bank-toolbar">
        <label style={{display:"flex",gap:5,alignItems:"center",fontSize:12}}>
         Relatório
         <select aria-label="Período do relatório bancário" value={reportMode}
          onChange={e=>setReportMode(e.target.value)} disabled={reportBusy}>
          <option value="imported_today">Importados hoje</option>
          <option value="today">Movimentos de hoje</option>
          <option value="yesterday">Ontem</option>
          <option value="yesterday_today">Ontem e hoje</option>
          <option value="last7">Últimos 7 dias</option>
         </select>
        </label>
        <button className="button primary bank-button" type="button"
         disabled={reportBusy||loading} onClick={()=>void sendBankReport()}>
         {reportBusy?"Enviando...":"Enviar relatório agora pelo WhatsApp"}
        </button>
        <button type="button" className="button bank-button"
         disabled={buttonTestBusy||loading} onClick={()=>void testBankButtons()}>
         {buttonTestBusy?"Testando...":"Testar botões no WhatsApp"}
        </button>
        <button type="button" className="button bank-button" disabled={!!busy} onClick={()=>void syncAll()}>
          <RefreshCw size={15}/> Importar extratos disponíveis
        </button>
        <button type="button" className="button primary bank-button" onClick={()=>document.getElementById("bank-connect")?.scrollIntoView({behavior:"smooth"})}>
          <Plus size={16}/> Conectar banco
        </button>
      </div>
    </section>
    {notice&&<div className="notice" role="status" aria-live="polite">{notice}</div>}
    <div className="grid grid-3 bank-metrics">
      <div className="card"><div className="bank-metric-top"><span className="metric-label">Contas ativas</span><span className="bank-metric-icon"><Landmark size={17}/></span></div>
        <div className="bank-metric-val">{activeConnections.length}</div><div className="metric-foot">Conexões autorizadas no app</div></div>
      <div className="card"><div className="bank-metric-top"><span className="metric-label">Saldo consultado</span><span className="bank-metric-icon"><Wallet size={17}/></span></div>
        <div className="bank-metric-val">{money((data?.accounts||[]).filter(a=>a.kind==="BANK"&&a.currency==="BRL"&&activeConnections.some(c=>c.id===a.connection_id)).reduce((s,a)=>s+Number(a.balance||0),0))}</div>
        <div className="metric-foot">Saldo bancário, separado do caixa contábil</div></div>
      <div className="card"><div className="bank-metric-top"><span className="metric-label">Última consulta do aplicativo</span><span className="bank-metric-icon"><Clock3 size={17}/></span></div>
        <div className="bank-metric-val" style={{fontSize:latest?17:22}}>{latest?date(latest):"—"}</div>
        <div className="metric-foot">Consulta feita pelo app, não necessariamente pelo banco</div></div>
      <div className="card"><div className="bank-metric-top"><span className="metric-label">Dados atualizados na origem</span>
        <span className="bank-metric-icon"><Clock3 size={17}/></span></div>
        <div className="bank-metric-val" style={{fontSize:providerLatest?17:22}}>{providerLatest?date(providerLatest):"—"}</div>
        <div className="metric-foot">Data informada pela Pluggy; {pendingVisible} movimentos pendentes entre os 150 recentes</div></div>
    </div>
    <section className="card" id="bank-connect">
      <div className="bank-section-head"><div><h3>Conectar instituição</h3><p>Escolha a instituição correta antes de autorizar ou vincular um item existente.</p></div><ShieldCheck size={20} color="var(--pos)"/></div>
      <div className="bank-tab-row" role="group" aria-label="Instituição bancária">
        {banks.map(b=><button type="button" className={"bank-tab"+(bank===b.slug?" active":"")}
          key={b.slug} disabled={!!busy} onClick={()=>{setBank(b.slug);setNotice("");}}>{b.name}</button>)}
      </div>
      <div className="bank-selected"><span className="bank-inline-badge"><LockKeyhole size={12}/> {selected.kind==="business"?"Conta empresarial":"Conta pessoal"}</span>
        <span>Destino: <strong>{workspace?.name||"Ambiente não cadastrado"}</strong></span>
      </div>
      <div className="bank-actions-split">
        <button type="button" className="button primary bank-button" disabled={!!busy||loading||!data?.configured||!workspace}
          onClick={()=>void connect()}><Plus size={16}/>{busy==="connecting"?"Abrindo autorização...":"Conectar pelo Meu Pluggy"}</button>
        <span className="metric-foot" style={{alignSelf:"center"}}>{data?.configured?"Integração técnica disponível":"Aguardando credenciais Pluggy"}</span>
      </div>
      <details className="bank-details">
        <summary>Já conectei a conta pelo Dashboard Pluggy <ChevronDown size={12} style={{display:"inline"}}/></summary>
        <p>Informe o UUID do item criado na aplicação demo pelo conector MeuPluggy. O identificador da conexão no site Meu Pluggy não é o mesmo.</p>
        <form className="bank-actions-split" onSubmit={e=>{e.preventDefault();void prepare(manualId.trim(),bank);}}>
          <input className="bank-input" aria-label="UUID do item bancário" placeholder="UUID do item bancário"
            value={manualId} onChange={e=>setManualId(e.target.value)} style={{flex:"1 1 250px"}} required/>
          <button className="button bank-button" type="submit" disabled={!!busy||!workspace||!data?.configured}>Conferir e vincular</button>
        </form>
      </details>
      <details className="bank-details">
        <summary>Importar extrato OFX sem assinatura <ChevronDown size={12} style={{display:"inline"}}/></summary>
        <p>Alternativa manual: exporte um extrato .ofx no banco e envie para conferência. A importação não realiza pagamentos nem altera seu caixa.</p>
        <form onSubmit={async e=>{
          e.preventDefault();const form=new FormData(e.currentTarget);const file=form.get("file");
          if(!(file instanceof File))return;
          form.set("bank",bank);setBusy("ofx");setNotice("");
          try{
            const response=await fetch("/api/banks/import",{method:"POST",body:form});
            const body=await response.json();
            if(!response.ok)throw new Error(body.error||"Falha ao importar.");
            setNotice(body.imported+" movimentações importadas de "+body.bank+". Revise antes de conciliar.");await load();
          }catch(err){setNotice(err instanceof Error?err.message:"Falha ao importar.");}
          finally{setBusy("");}
        }}>
          <input className="bank-file" type="file" name="file" accept=".ofx,.qfx" required aria-label="Selecionar extrato OFX"/>
          <button className="button bank-button" type="submit" disabled={!!busy||!workspace}><FileUp size={15}/> Importar OFX</button>
        </form>
      </details>
    </section>
    <section>
      <div className="bank-section-head">
        <div><h3>Conexões bancárias</h3><p>Gerencie acesso, sincronização e histórico de cada conta.</p></div>
        <button type="button" className="button bank-button compact" onClick={()=>setShowArchived(!showArchived)}>
          {showArchived?"Ver ativas":"Arquivadas ("+archivedConnections.length+")"}
        </button>
      </div>
      {loading?<div className="bank-empty">Carregando suas conexões...</div>
        :visibleConnections.length===0?<div className="bank-empty"><Landmark size={24}/>
          {showArchived?"Nenhuma conexão arquivada.":"Nenhuma conexão ativa. Conecte seu primeiro banco acima."}</div>
        :<div className="bank-connection-grid">{visibleConnections.map(c=>{
          const accounts=(data?.accounts||[]).filter(a=>a.connection_id===c.id);
          const last=accounts.find(a=>a.account_last4)?.account_last4;
          return <article className="bank-connection" key={c.id}>
            <div className="bank-connection-head">
              <div className="bank-bank-icon">{c.provider==="manual"?<FileUp size={22}/>:<Landmark size={22}/>}</div>
              <div className="bank-connection-title">
                <strong>{c.display_name}</strong>
                <span className="bank-inline-badge">{data?.workspaces.find(w=>w.id===c.workspace_id)?.name||"Ambiente"}</span>
              </div>
              <span className={"bank-inline-badge "+(c.archived_at||c.status==="disconnected"?"warn":"good")}>
                {c.archived_at?"Arquivada":c.status==="connected"?"Ativa":c.status==="attention"?"Atenção":"Pausada"}
              </span>
            </div>
            <div className="bank-connection-data"><span>Tipo de conexão</span><b>{c.provider==="manual"?"Importação OFX":"Pluggy"}</b></div>
            <div className="bank-connection-data"><span>Conta / final</span><b>{accounts.map(a=>a.display_name).join(", ")||"—"} {last?" • "+last:""}</b></div>
            <div className="bank-connection-data"><span>Saldo consultado</span><b>{money(accounts.filter(a=>a.kind==="BANK"&&a.currency==="BRL").reduce((s,a)=>s+Number(a.balance||0),0))}</b></div>
            <div className="bank-connection-data"><span>Banco/Pluggy atualizou</span>
              <b>{c.provider_last_updated_at?date(c.provider_last_updated_at):"Sem data de origem disponível"}</b></div>
            <div className="bank-connection-data"><span>App consultou</span>
              <b>{date(c.last_synced_at)}</b></div>
            <div className="bank-connection-data"><span>Última importação</span>
              <b>{c.last_new_transaction_count} novos / {c.last_scanned_transaction_count} conferidos</b></div>
            {c.provider==="pluggy"&&<div className="bank-connection-data"><span>Webhook da Pluggy</span>
              <b style={{color:c.webhook_check_status==="verified"?"#166534":
                c.webhook_check_status==="failed"?"#b91c1c":undefined}}>
                {c.webhook_check_status==="verified"?"Cadastro verificado":
                 c.webhook_check_status==="failed"?"Verificação falhou":"Ainda não verificado"}
              </b>
              {c.webhook_check_at&&<small style={{display:"block"}}>
               Conferido: {date(c.webhook_check_at)}</small>}
              {c.webhook_check_error&&<small style={{display:"block"}}>{c.webhook_check_error}</small>}
            </div>}
            {c.last_error&&<div className="bank-risk" style={{marginTop:10}}>{c.last_error}</div>}
            <div className="bank-connection-actions">
              {!c.archived_at&&c.provider==="pluggy"&&<button type="button" className="button bank-button" disabled={!!busy||c.status==="disconnected"}
                onClick={()=>void sync(c.id,true)}><RefreshCw size={14}/>{busy===c.id?"Importando...":"Importar dados disponíveis"}</button>}
              {!c.archived_at&&c.provider==="pluggy"&&<a className="button bank-button"
                href="https://meu.pluggy.ai/" target="_blank" rel="noopener noreferrer">
                Conferir atualização no Meu Pluggy
              </a>}
              {!c.archived_at&&<button type="button" className="button bank-button" disabled={!!busy}
                onClick={()=>void toggle(c)}>{c.status==="disconnected"?"Reativar":"Pausar"}</button>}
              <button type="button" className="button bank-button danger" disabled={!!busy} onClick={()=>openDelete(c)}>
                <Trash2 size={14}/>{c.archived_at?"Excluir dados":"Remover"}</button>
            </div>
          </article>;
        })}</div>}
    </section>
    <section className="card">
      <div className="bank-section-head"><div><h3>Extrato para conferência</h3>
        <p>Últimos 150 movimentos da visão selecionada. Sem alterações automáticas no caixa e sem execução de Pix.</p></div>
        <span className="bank-inline-badge"><CreditCard size={13}/> {showArchived?"Histórico arquivado":"Leitura somente"}</span>
      </div>
      <div className="bank-filters">
        <input className="bank-input search" aria-label="Buscar lançamentos" placeholder="Buscar descrição ou conta" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="bank-select" aria-label="Filtrar ambiente" value={filterWorkspace} onChange={e=>setFilterWorkspace(e.target.value)}>
          <option value="all">Todos os ambientes</option><option value="business">Prime Group</option><option value="personal">Pessoal</option>
        </select>
        <select className="bank-select" aria-label="Filtrar movimento" value={filterDirection} onChange={e=>setFilterDirection(e.target.value)}>
          <option value="all">Entradas e saídas</option><option value="credit">Entradas</option><option value="debit">Saídas</option>
        </select>
        <select className="bank-select" aria-label="Filtrar por área financeira" value={filterArea} onChange={e=>setFilterArea(e.target.value)}>
         <option value="all">Todas as classificações</option>
         {(["prime","personal","interest","transfer","pending"] as BankArea[]).map(k=>
           <option key={k} value={k}>{bankAreaLabels[k]}</option>
         )}
        </select>
        <select className="bank-select" aria-label="Filtrar conferência" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="all">Todos os status</option><option value="pending">Pendentes</option><option value="ignored">Ignorados</option><option value="matched">Conciliados</option>
        </select>
        <input className="bank-input" type="date" aria-label="A partir de" value={startDate} onChange={e=>setStartDate(e.target.value)}/>
        <input className="bank-input" type="date" aria-label="Até" value={endDate} onChange={e=>setEndDate(e.target.value)}/>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Data</th><th>Conta</th><th>Descrição</th><th>Valor</th><th>Área financeira</th><th>Conferência</th></tr></thead>
      <tbody>{filteredTransactions.map(t=><tr key={t.id}>
        <td style={{whiteSpace:"nowrap"}}>{new Date(t.occurred_on+"T12:00:00").toLocaleDateString("pt-BR")}</td>
        <td>{accountMap.get(t.bank_account_id)?.display_name||"Conta"}</td>
        <td>{t.description}</td>
        <td><span className={"bank-money "+(t.direction==="credit"?"credit":"debit")}>
          {t.direction==="credit"?<ArrowDownLeft size={13} style={{verticalAlign:"middle"}}/>:<ArrowUpRight size={13} style={{verticalAlign:"middle"}}/>} {t.direction==="credit"?"+":"−"} {money(Number(t.amount))}
        </span></td>
        <td><BankMovementDestination key={t.id+":"+(classificationMap.get(t.id)?.destination||"pending")}
            id={t.id} destination={classificationMap.get(t.id)?.destination}
            category={classificationMap.get(t.id)?.category}
            onSaved={load}/></td>
        <td><div className="bank-transaction-actions">
          {t.review_status==="matched"?<span className="bank-inline-badge good"><CheckCircle2 size={12}/> Conciliada</span>:<>
          <details className="premium-disclosure"><summary>Detalhar categoria</summary>
            <form onSubmit={async e=>{e.preventDefault();setBusy(t.id);
              try{await classifyBankMovement(new FormData(e.currentTarget));setNotice("Classificação salva para conferência, sem alterar caixa.");await load();}
              catch(error){setNotice(error instanceof Error?error.message:"Falha ao classificar.");}
              finally{setBusy("");}
            }} className="bank-classify-form">
              <input type="hidden" name="id" value={t.id}/>
              <input type="hidden" name="destination" value={classificationMap.get(t.id)?.destination||"pending"}/>
              <input className="bank-input" type="text" name="category" maxLength={80} placeholder="Categoria (ex.: combustível)" defaultValue={classificationMap.get(t.id)?.category||""}/>
              <button type="submit" className="button primary compact" disabled={!!busy}>Salvar categoria</button>
            </form>
          </details>
          <button type="button" className="button compact bank-button" disabled={!!busy}
            onClick={()=>void review(t.id,t.review_status==="ignored"?"pending":"ignored")}>
            {t.review_status==="ignored"?"Reabrir":"Ignorar"}
          </button></>}
        </div></td>
      </tr>)}
      {!filteredTransactions.length&&<tr><td colSpan={6} style={{textAlign:"center",padding:25,color:"var(--muted)"}}>Nenhum lançamento encontrado para esses filtros.</td></tr>}
      </tbody></table></div>
      <div className="bank-tx-count">
        {filteredTransactions.length} movimento(s) exibido(s).
        {" "}{filteredTransactions.filter(t=>["prime","personal","interest"].includes(classificationMap.get(t.id)?.destination||"")).length} marcado(s) como Empresa, Pessoal ou Empréstimo.
        Os filtros atuam sobre os últimos 150 resultados, não sobre todo o histórico.
        A classificação não altera a origem do dinheiro nem quita contas automaticamente.
      </div>
    </section>
    {preview&&<div className="bank-modal-backdrop" role="presentation">
      <div className="bank-modal" role="dialog" aria-modal="true" aria-labelledby="bank-preview-heading">
        <div className="bank-section-head"><h3 id="bank-preview-heading">Conferir antes de vincular</h3>
          <button type="button" className="button compact" onClick={()=>setPreview(null)} aria-label="Fechar"><X size={16}/></button></div>
        <p>Confira se a instituição e o ambiente estão corretos. Isso impede que a conta do Itaú seja cadastrada como Inter por engano.</p>
        <div className="bank-connection-data"><span>Banco escolhido</span><b>{bankName(preview.bank)}</b></div>
        <div className="bank-connection-data"><span>Ambiente</span><b>{workspace?.name||"Indisponível"}</b></div>
        <div className="bank-connection-data"><span>Conta(s) encontrada(s)</span><b>{preview.accounts.map(a=>a.name+(a.last4?" • "+a.last4:"")).join(", ")||"Não identificada"}</b></div>
        {preview.mismatch?<div className="bank-risk" style={{marginTop:15}}><CircleAlert size={15} style={{verticalAlign:"middle"}}/> Banco divergente: identificamos {bankName(preview.detected!)}. Feche esta tela e selecione o banco correto.</div>
        :<label className="bank-modal-option" style={{marginTop:16}}>
          <input type="checkbox" checked={previewApproved} onChange={e=>setPreviewApproved(e.target.checked)}/>
          <span><strong>Confirmo a instituição, a titularidade e o ambiente acima</strong><small>O acesso será somente de leitura. Nenhum pagamento será realizado.</small></span>
        </label>}
        <div className="bank-modal-footer">
          <button type="button" className="button" onClick={()=>setPreview(null)}>Cancelar</button>
          <button type="button" className="button primary" disabled={!!busy||!previewApproved||preview.mismatch||!workspace}
            onClick={()=>void confirmPreview()}>{busy==="attach"?"Vinculando...":"Confirmar conexão"}</button>
        </div>
      </div>
    </div>}
    {deleting&&<div className="bank-modal-backdrop" role="presentation">
      <div className="bank-modal" role="dialog" aria-modal="true" aria-labelledby="bank-delete-heading">
        <div className="bank-section-head"><h3 id="bank-delete-heading">Remover conexão bancária</h3>
          <button type="button" className="button compact" onClick={()=>setDeleting(null)} aria-label="Fechar"><X size={16}/></button></div>
        <p>Conexão <strong>{deleting.display_name}</strong> • {data?.workspaces.find(w=>w.id===deleting.workspace_id)?.name}.</p>
        <div className="bank-modal-options">
          {!deleting.archived_at&&<label className="bank-modal-option">
            <input type="radio" name="remove-type" checked={deleteMode==="archive"} onChange={()=>setDeleteMode("archive")}/>
            <span><strong>Desvincular e manter o histórico</strong><small>Interrompe o acesso por este vínculo. Extratos continuam disponíveis em Arquivadas, sem entrar no saldo ativo.</small></span>
          </label>}
          <label className="bank-modal-option">
            <input type="radio" name="remove-type" checked={deleteMode==="remove"} onChange={()=>setDeleteMode("remove")}/>
            <span><strong>Excluir conexão e todos os extratos importados</strong><small>Exclusão permanente dos dados bancários associados dentro do Prime Finance. Não pode ser desfeita.</small></span>
          </label>
        </div>
        {deleteMode==="remove"&&<div className="bank-risk"><CircleAlert size={15} style={{verticalAlign:"middle"}}/> A exclusão é irreversível. Transações conciliadas impedem a remoção para proteger a contabilidade.</div>}
        <label className="bank-modal-confirm">Para confirmar, digite exatamente <strong>{deleting.display_name}</strong>
          <input className="bank-input" value={confirmName} onChange={e=>setConfirmName(e.target.value)} placeholder={deleting.display_name}/>
        </label>
        <p>Esta ação não revoga o consentimento no Meu Pluggy ou no seu banco. A revogação deve ser feita separadamente nesses serviços.</p>
        <div className="bank-modal-footer">
          <button type="button" className="button" onClick={()=>setDeleting(null)}>Cancelar</button>
          <button type="button" className={"button "+(deleteMode==="remove"?"bank-button danger":"primary")} disabled={!!busy||confirmName!==deleting.display_name}
            onClick={()=>void removeConnection()}><Trash2 size={14} style={{verticalAlign:"middle",marginRight:6}}/>{busy==="remove"?"Processando...":deleteMode==="archive"?"Desvincular":"Excluir definitivamente"}</button>
        </div>
      </div>
    </div>}
  </div>;
}
