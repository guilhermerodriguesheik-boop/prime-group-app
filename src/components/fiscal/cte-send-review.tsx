"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {ClipboardCheck,Send,Save,X,ShieldAlert,Plus} from "lucide-react";
import {registerDriver,registerTransportVehicle} from "@/app/cadastros/transporte/actions";
import {correctionFromProvider} from "@/lib/fiscal/cte-recovery";
import {CteComplianceFields} from "@/components/fiscal/cte-compliance-fields";
import {emptyCteCompliance,type CteCompliance} from "@/lib/fiscal/cte-compliance";
type Config={cfop:string;tomador:string;produto_predominante:string;uf_licenciamento:string;numbering_verified:boolean;compliance:CteCompliance};
type Preview={
 hash:string;ready:boolean;retryAllowed:boolean;missing:string[];autofilled?:string[];advisories?:string[];invoiceCount:number;freightValue:number;goodsValue:number;
 grossWeight:number;cargoReference:string|null;ciot:string|null;rntrc:string|null;config:Config;
 numberingEvidence?:{series:string;nextNumber:number;lastExternalNumber:number|null;matched:boolean}|null;previousExternalCteNumber?:string|null;
};
type Data={
 preview:Preview;retryHistory?:Array<{archived_at:string;previous_status:string;previous_error_code:string|null}>;submission:{status:string;access_key?:string|null;protocol?:string|null;error_code?:string|null;provider_response?:{message?:string;reason?:string;definitive_rejection?:boolean;reconciliation?:{checked_at?:string;cte_list_http_status?:number|null;total_rows_inspected?:number;possible_matches?:Array<Record<string,string>>;note?:string;emitter_profile_http_status?:number|null}}|null}|null;
 draft:{vehicle_id:string|null;driver_id:string|null;status:string};
 vehicles:Array<{id:string;nickname:string;plate:string}>;
 drivers:Array<{id:string;name:string}>;
 error?:string;
};
const blank:Config={cfop:"",tomador:"",produto_predominante:"",uf_licenciamento:"",numbering_verified:false,compliance:emptyCteCompliance};
export function CteSendReview({draftId}:{draftId:string}){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [loading,setLoading]=useState(false);
 const [data,setData]=useState<Data|null>(null);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [config,setConfig]=useState<Config>(blank);
 const [ciotValue,setCiotValue]=useState("");
 const [vehicle,setVehicle]=useState("");
 const [driver,setDriver]=useState("");
 const [consultText,setConsultText]=useState("");
 const [emailStatus,setEmailStatus]=useState<{authorized:boolean;sourceLinked:boolean;existing:{status:string;recipient_email?:string}|null}|null>(null);
 const [emailBusy,setEmailBusy]=useState(false);
 const [creating,setCreating]=useState<"driver"|"vehicle"|null>(null);
 async function refresh(){
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/fiscal/cte/review?draftId="+encodeURIComponent(draftId),{cache:"no-store"});
   const json=await r.json() as Data;
   if(!r.ok)throw Error(json.error||"Não foi possível carregar a revisão.");
   setData(json);setConfig(json.preview.config);setCiotValue(json.preview.ciot||"");setVehicle(json.draft.vehicle_id||(json.vehicles.length===1?json.vehicles[0].id:""));setDriver(json.draft.driver_id||(json.drivers.length===1?json.drivers[0].id:""));
   const status=await fetch("/api/fiscal/cte/email-reply?draftId="+encodeURIComponent(draftId),{cache:"no-store"});
   setEmailStatus(status.ok?await status.json():null);
  }catch(e){setError(e instanceof Error?e.message:"Falha ao revisar.");}
  finally{setLoading(false)}
 }
 async function consultProvider(){
  if(!data?.preview.cargoReference)return;
  setLoading(true);setError("");
  try{
   const params=new URLSearchParams({kind:"cte",cargo:data.preview.cargoReference});
   const r=await fetch("/api/fiscal/dotcompany/insights?"+params.toString(),{cache:"no-store"});
   const answer=await r.json() as {error?:string;provider?:{ok:boolean;error?:string|null;items?:unknown[]}};
   if(!r.ok)throw Error(answer.error||"Consulta indisponível.");
   setConsultText(answer.provider?.ok?
     "Consulta recebida: "+(answer.provider?.items?.length||0)+" documento(s) na listagem. Uma lista vazia não comprova rejeição nem libera novo envio.":
     "A DotCompany não confirmou a situação: "+(answer.provider?.error||"consulta indisponível")+".");
  }catch(e){setError(e instanceof Error?e.message:"Consulta indisponível.");}
  finally{setLoading(false);}
 }
 async function createTransport(kind:"driver"|"vehicle",form:FormData){
  setLoading(true);setError("");setMessage("");
  try{
   if(kind==="driver")await registerDriver(form);
   else await registerTransportVehicle(form);
   setCreating(null);
   await refresh();router.refresh();
   setMessage(kind==="driver"?"Motorista incluído no cadastro central. Selecione-o acima.":"Veículo incluído na frota central. Selecione-o acima.");
  }catch(e){setError(e instanceof Error?e.message:"Falha ao cadastrar. Confira os dados.");setLoading(false);}
 }
 async function save(){
  setLoading(true);setError("");setMessage("");
  try{
   const r=await fetch("/api/fiscal/cte/review",{
    method:"POST",headers:{"Content-Type":"application/json","x-prime-action":"fiscal-cte-configure"},
    body:JSON.stringify({draftId,vehicleId:vehicle,driverId:driver,config,ciot:ciotValue}),
   });
   const j=await r.json() as {error?:string;message?:string};
   if(!r.ok)throw Error(j.error||"Falha ao salvar a conferência.");
   setMessage(j.message||"Salvo.");await refresh();router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Falha ao salvar.");setLoading(false);}
 }
 async function sendEmail(){
  if(!emailStatus?.authorized||!emailStatus.sourceLinked||emailStatus.existing)return;
  if(!window.confirm("Confirma responder ao e-mail original da Ortobom com o XML do CT-e autorizado?"))return;
  setEmailBusy(true);setError("");setMessage("");
  try{
   const res=await fetch("/api/fiscal/cte/email-reply",{
    method:"POST",headers:{"Content-Type":"application/json","x-prime-action":"ortobom-cte-email"},
    body:JSON.stringify({draftId,confirmation:"CONFIRMO ENVIO DO CT-E À ORTOBOM"}),
   });
   const data=await res.json() as {error?:string;recipient?:string;sent?:boolean};
   if(!res.ok)throw Error(data.error||"Envio não confirmado.");
   setMessage("CT-e enviado para "+data.recipient+" e registrado no histórico.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar.");}
  finally{setEmailBusy(false)}
 }
 async function submit(){
  if(!data?.preview.ready)return;
  if(!window.confirm("CONFIRMA o envio real deste CT-e à SEFAZ? A DotCompany poderá cobrar e validar/rejeitar os dados fiscais."))return;
  if(data.preview.previousExternalCteNumber &&
   !window.confirm("Esta carga já possui CT-e nº "+data.preview.previousExternalCteNumber+
   " no histórico do Cargozilla. Você confirma pedir OUTRA emissão, ciente do risco de duplicidade?"))return;
  setLoading(true);setError("");setMessage("");
  try{
   const r=await fetch("/api/fiscal/cte/confirm",{
    method:"POST",headers:{"Content-Type":"application/json","x-prime-action":"fiscal-cte-confirm"},
    body:JSON.stringify({draftId,hash:data.preview.hash,confirmation:"CONFIRMO O ENVIO À SEFAZ"}),
   });
   const j=await r.json() as {error?:string;reason?:string;message?:string;authorized?:boolean;key?:string;protocol?:string};
   if(!r.ok){await refresh();throw Error([j.error,j.reason].filter(Boolean).join(" — ")||"Falha ao transmitir. Consulte o resultado antes de tentar novamente.");}
   setMessage(j.message||"Resultado recebido da API.");
   await refresh();router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Erro ao enviar.");setLoading(false);}
 }
 const editable=!data?.submission||
  (["rejected","indeterminate"].includes(data.submission.status)&&
   !data.submission.access_key&&!data.submission.protocol);
 const correction=data?.submission?correctionFromProvider(data.submission.status,
  data.submission.error_code,data.submission.provider_response):null;
 return <>
  <button className="button" type="button" onClick={()=>{setOpen(true);setMessage("");setError("");void refresh()}}>
    <ClipboardCheck size={14}/> Revisar / enviar
  </button>
  {open&&<div className="fiscal-review-backdrop" role="presentation">
    <section role="dialog" aria-modal="true" aria-label="Revisão de CT-e antes da SEFAZ" className="fiscal-review-dialog">
      <div className="fiscal-review-heading">
        <div><span className="fiscal-section-kicker">CONFIRMAÇÃO HUMANA OBRIGATÓRIA</span>
          <h3>Conferir CT-e antes da SEFAZ</h3>
          <p>A importação e a IA nunca transmitem automaticamente. Somente sua confirmação poderá solicitar o envio real.</p>
        </div>
        <button type="button" className="button" aria-label="Fechar revisão" onClick={()=>setOpen(false)}><X size={17}/></button>
      </div>
      {loading&&!data&&<p>Carregando dados da viagem...</p>}
      {data&&<>
        <div className="fiscal-review-summary">
          <strong>Carga {data.preview.cargoReference||"sem referência"} · {data.preview.invoiceCount} NF-e</strong>
          <p>Frete: {data.preview.freightValue.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} ·
             Mercadoria: {data.preview.goodsValue.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} ·
             Peso: {data.preview.grossWeight.toLocaleString("pt-BR")} kg · CIOT: {data.preview.ciot||"pendente"}</p>
          <p>Modelo do último CT-e (nº 33, série 003): CFOP, tomador e produto são sugeridos apenas para operações RJ–RJ. Confira cada carga antes de salvar e emitir. Veículo e motorista só são sugeridos automaticamente quando houver um único cadastro ativo.</p>
        </div>
        {(!!data.preview.autofilled?.length||!!data.preview.advisories?.length)&&
         <div className="fiscal-review-summary">
           <strong>Pré-preenchimento automático da carga</strong>
           {!!data.preview.autofilled?.length&&
             <p>Recuperado de XML, cadastro fiscal e histórico: {data.preview.autofilled.join(" · ")}.</p>}
           {!!data.preview.advisories?.length&&
             <p>Avisos (não são declarações de consulta oficial): {data.preview.advisories.join(" · ")}</p>}
         </div>}
        {data.submission&&<div className="fiscal-review-summary" role="status">
          <strong>Transmissão registrada: {data.submission.status}</strong>
          <p>Chave: {data.submission.access_key||"Aguardar consulta"} · Protocolo: {data.submission.protocol||"Não confirmado"}</p>
          <p>Não tente enviar novamente uma operação com resultado desconhecido.</p>
          {data.submission.provider_response?.reconciliation&&<div role="status">
            <strong>Consulta de reconciliação fiscal</strong>
            <p>Verificada em {data.submission.provider_response.reconciliation.checked_at||"data não disponível"} · DotCompany HTTP {data.submission.provider_response.reconciliation.cte_list_http_status??"indisponível"} · Possíveis documentos: {data.submission.provider_response.reconciliation.possible_matches?.length??0}</p>
            <p>{data.submission.provider_response.reconciliation.note||"Aguardando conferência de resultado."}</p>
          </div>}
        </div>}
        {data.submission&&correction&&data.submission.status!=="authorized"&&
          <div className="fiscal-review-summary" role="alert" style={{borderLeft:"3px solid #d97706"}}>
            <strong>Corrigir causa do problema: {correction.title}</strong>
            {data.submission.provider_response?.message&&
             <p>Resposta da DotCompany: {data.submission.provider_response.message}</p>}
            <p>{correction.description}</p>
            {data.preview.retryAllowed?
             <p>Rejeição definitiva confirmada: você pode corrigir os dados, salvar e solicitar nova emissão. A tentativa anterior ficará arquivada.</p>:
             <p>Nova emissão bloqueada até confirmação do resultado anterior. É permitido revisar os dados sem reenviar.</p>}
            <div className="fiscal-review-actions">
             <button className="button" type="button" disabled={loading} onClick={()=>void consultProvider()}>
              Consultar situação na DotCompany
             </button>
             {editable&&<button className="button" type="button"
               onClick={()=>document.getElementById("cte-review-edit-"+draftId)?.scrollIntoView({behavior:"smooth"})}>
               Corrigir campos neste aplicativo
             </button>}
             {correction.action==="emissor"&&<a href="https://erp.dotcompany.com.br/api-dev/emissores"
               target="_blank" rel="noopener noreferrer">Abrir emissor fiscal ↗</a>}
            </div>
            {consultText&&<p role="status">{consultText}</p>}
          </div>}
        {!!data.retryHistory?.length&&<div className="fiscal-review-summary">
          <strong>Histórico de tentativas anteriores</strong>
          <ul>{data.retryHistory.map((attempt,i)=>
            <li key={i}>{new Date(attempt.archived_at).toLocaleString("pt-BR")} ·
               {attempt.previous_status} · {attempt.previous_error_code||"sem código"}</li>)}</ul>
        </div>}
        {emailStatus?.authorized&&<div className="fiscal-review-summary">
          <strong>Responder à Ortobom com o CT-e autorizado</strong>
          <p>{emailStatus.existing?
            "Registro do envio: "+emailStatus.existing.status+(emailStatus.existing.recipient_email?" · "+emailStatus.existing.recipient_email:""):
            emailStatus.sourceLinked?
            "Envia resposta na conversa original com XML autorizado e salva o resultado no aplicativo.":
            "Não foi encontrado o e-mail de origem desta carga. Vincule primeiro a mensagem da Ortobom."}</p>
          <p>Para envio direto, é necessário reconectar o Gmail concedendo também a permissão de enviar e-mails.</p>
          <a href="/api/fiscal/gmail/connect">Autorizar envio pelo Gmail ↗</a>
          <div className="fiscal-review-actions">
            <button className="button" type="button" onClick={()=>void sendEmail()}
              disabled={emailBusy||!emailStatus.sourceLinked||!!emailStatus.existing}>
              {emailBusy?"Enviando...":"Responder ao e-mail da Ortobom"}
            </button>
          </div>
        </div>}
        {data.preview.numberingEvidence&&<div className="fiscal-review-summary" role="status">
          <strong>Numeração fiscal — DotCompany x histórico Cargozilla</strong>
          <p>DotCompany: CT-e série {data.preview.numberingEvidence.series.padStart(3,"0")},
            próximo número {data.preview.numberingEvidence.nextNumber}. Histórico local:
            série 003, último número {data.preview.numberingEvidence.lastExternalNumber??"não identificado"}.</p>
          <p>{data.preview.numberingEvidence.matched
            ?"Sequência confrontada com o histórico local e o perfil do emissor. Não equivale a consulta atual à SEFAZ."
            :"Divergência informativa: o aplicativo não impede seu envio. A DotCompany pode emitir na série configurada ou recusar."}</p>
        </div>}
        <div className="fiscal-review-form" id={"cte-review-edit-"+draftId}>
          <label>Veículo
            <select value={vehicle} onChange={e=>setVehicle(e.target.value)} disabled={!editable}>
              <option value="">Selecione</option>{data.vehicles.map(x=><option key={x.id} value={x.id}>{x.nickname||x.plate} · {x.plate}</option>)}
            </select>
          </label>
          <label>Motorista
            <select value={driver} onChange={e=>setDriver(e.target.value)} disabled={!editable}>
              <option value="">Selecione</option>{data.drivers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label>CFOP (conferir com contabilidade)
            <input value={config.cfop} onChange={e=>setConfig(c=>({...c,cfop:e.target.value}))} maxLength={4} placeholder="Ex.: 5352" disabled={!editable}/>
          </label>
          <label>Tomador do frete
            <select value={config.tomador} onChange={e=>setConfig(c=>({...c,tomador:e.target.value}))} disabled={!!data.submission}>
              <option value="">Selecione</option>
              <option value="0">0 · Remetente</option><option value="1">1 · Expedidor</option>
              <option value="2">2 · Recebedor</option><option value="3">3 · Destinatário</option>
              <option value="4">4 · Outros</option>
            </select>
          </label>
          <label>Produto predominante
            <input value={config.produto_predominante} onChange={e=>setConfig(c=>({...c,produto_predominante:e.target.value}))}
              maxLength={120} placeholder="Ex.: COLCHÕES" disabled={!editable}/>
          </label>
          <label>UF de licenciamento da placa
            <input value={config.uf_licenciamento} onChange={e=>setConfig(c=>({...c,uf_licenciamento:e.target.value.toUpperCase()}))}
              maxLength={2} placeholder="RJ" disabled={!editable}/>
          </label>
        </div>
        <CteComplianceFields value={config.compliance}
          onChange={compliance=>setConfig(prev=>({...prev,compliance}))}
          disabled={!editable} ciot={ciotValue} onCiotChange={setCiotValue}
          rntrc={data.preview.rntrc}/>
        <div className="fiscal-review-actions" style={{justifyContent:"flex-start"}}>
          <button className="button" type="button" onClick={()=>setCreating(creating==="driver"?null:"driver")} disabled={loading||!editable}><Plus size={14}/> Novo motorista</button>
          <button className="button" type="button" onClick={()=>setCreating(creating==="vehicle"?null:"vehicle")} disabled={loading||!editable}><Plus size={14}/> Novo veículo</button>
          <a href="/cadastros/transporte" target="_blank" rel="noopener noreferrer" style={{fontSize:12}}>Ver todos os cadastros ↗</a>
        </div>
        {creating&&<form className="fiscal-review-form" onSubmit={e=>{
         e.preventDefault();
         void createTransport(creating,new FormData(e.currentTarget));
        }} style={{border:"1px solid var(--line)",borderRadius:12,padding:14}}>
         {creating==="driver"?<>
           <label>Nome do motorista<input required name="name" maxLength={120} placeholder="Nome completo"/></label>
           <label>CPF<input required name="cpf" inputMode="numeric" maxLength={14}/></label>
           <label>CNH<input name="cnh" maxLength={40}/></label>
           <label>Validade da CNH<input type="date" name="cnhExpires"/></label>
           <label className="span-two">Telefone<input name="phone" inputMode="tel"/></label>
         </>:<>
           <label>Placa<input required name="plate" placeholder="ABC1D23" maxLength={9}/></label>
           <label>Identificação no aplicativo<input required name="nickname" placeholder="Toco / Sprinter"/></label>
           <label>Marca<input name="make" maxLength={80}/></label>
           <label>Modelo<input name="model" maxLength={80}/></label>
         </>}
         <div className="span-two fiscal-review-actions">
           <button type="button" className="button" disabled={loading} onClick={()=>setCreating(null)}>Cancelar</button>
           <button type="submit" className="button primary" disabled={loading}>Salvar cadastro compartilhado</button>
         </div>
        </form>}
        <div className="fiscal-review-actions">
          <button className="button" onClick={()=>void save()} disabled={loading||!editable||data.draft.status!=="draft"}><Save size={15}/> Salvar conferência</button>
        </div>
        <div className="fiscal-review-summary" role="status">
          <strong>{data.preview.ready?"Solicitação liberada para a DotCompany/SEFAZ.":"Impedimentos técnicos de envio:"}</strong>
          {data.preview.missing.length>0&&<ul>{data.preview.missing.map((m,i)=><li key={i}>{m}</li>)}</ul>}
          {!!data.preview.advisories?.length&&<div><p><strong>Avisos fiscais (não impedem solicitação):</strong></p>
           <ul>{data.preview.advisories.map((m,i)=><li key={i}>{m}</li>)}</ul></div>}
           <p>Depois de sua confirmação, a DotCompany processa a solicitação. Apenas chave e protocolo autorizados comprovam emissão.</p>
        </div>
        <div className="fiscal-review-actions">
          <button className="button primary" type="button" onClick={()=>void submit()}
            disabled={loading||!data.preview.ready||!!data.submission&&!data.preview.retryAllowed}><Send size={16}/> {data.preview.retryAllowed?"Confirmar nova tentativa à SEFAZ":"Confirmar e enviar à SEFAZ"}</button>
        </div>
      </>}
      {error&&<p className="fiscal-inline-alert" role="alert"><ShieldAlert size={16}/>{error}</p>}
      {message&&<p className="fiscal-inline-alert" role="status">{message}</p>}
    </section>
  </div>}
 </>;
}
