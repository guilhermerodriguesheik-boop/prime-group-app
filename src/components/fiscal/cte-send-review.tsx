"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {ClipboardCheck,Send,Save,X,ShieldAlert,Plus} from "lucide-react";
import {registerDriver,registerTransportVehicle} from "@/app/cadastros/transporte/actions";
type Config={cfop:string;tomador:string;produto_predominante:string;uf_licenciamento:string;numbering_verified:boolean};
type Preview={
 hash:string;ready:boolean;missing:string[];invoiceCount:number;freightValue:number;goodsValue:number;
 grossWeight:number;cargoReference:string|null;ciot:string|null;config:Config;
};
type Data={
 preview:Preview;submission:{status:string;access_key?:string|null;protocol?:string|null;error_code?:string|null}|null;
 draft:{vehicle_id:string|null;driver_id:string|null;status:string};
 vehicles:Array<{id:string;nickname:string;plate:string}>;
 drivers:Array<{id:string;name:string}>;
 error?:string;
};
const blank:Config={cfop:"",tomador:"",produto_predominante:"",uf_licenciamento:"",numbering_verified:false};
export function CteSendReview({draftId}:{draftId:string}){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [loading,setLoading]=useState(false);
 const [data,setData]=useState<Data|null>(null);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [config,setConfig]=useState<Config>(blank);
 const [vehicle,setVehicle]=useState("");
 const [driver,setDriver]=useState("");
 const [consent,setConsent]=useState(false);
 const [creating,setCreating]=useState<"driver"|"vehicle"|null>(null);
 async function refresh(){
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/fiscal/cte/review?draftId="+encodeURIComponent(draftId),{cache:"no-store"});
   const json=await r.json() as Data;
   if(!r.ok)throw Error(json.error||"Não foi possível carregar a revisão.");
   setData(json);setConfig(json.preview.config);setVehicle(json.draft.vehicle_id||(json.vehicles.length===1?json.vehicles[0].id:""));setDriver(json.draft.driver_id||(json.drivers.length===1?json.drivers[0].id:""));
   setConsent(false);
  }catch(e){setError(e instanceof Error?e.message:"Falha ao revisar.");}
  finally{setLoading(false)}
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
  if(!vehicle||!driver){setError("Selecione veículo e motorista.");return}
  setLoading(true);setError("");setMessage("");
  try{
   const r=await fetch("/api/fiscal/cte/review",{
    method:"POST",headers:{"Content-Type":"application/json","x-prime-action":"fiscal-cte-configure"},
    body:JSON.stringify({draftId,vehicleId:vehicle,driverId:driver,config}),
   });
   const j=await r.json() as {error?:string;message?:string};
   if(!r.ok)throw Error(j.error||"Falha ao salvar a conferência.");
   setMessage(j.message||"Salvo.");await refresh();router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Falha ao salvar.");setLoading(false);}
 }
 async function submit(){
  if(!data?.preview.ready||!consent)return;
  if(!window.confirm("CONFIRMA o envio real deste CT-e à SEFAZ? Esta ação pode gerar um documento fiscal e cobrança da DotCompany."))return;
  setLoading(true);setError("");setMessage("");
  try{
   const r=await fetch("/api/fiscal/cte/confirm",{
    method:"POST",headers:{"Content-Type":"application/json","x-prime-action":"fiscal-cte-confirm"},
    body:JSON.stringify({draftId,hash:data.preview.hash,confirmation:"CONFIRMO O ENVIO À SEFAZ"}),
   });
   const j=await r.json() as {error?:string;message?:string;authorized?:boolean;key?:string;protocol?:string};
   if(!r.ok)throw Error(j.error||"Falha ao transmitir. Não tente novamente sem consultar o emissor.");
   setMessage(j.message||"Resultado recebido da API.");
   await refresh();router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Erro ao enviar.");setLoading(false);}
 }
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
        {data.submission&&<div className="fiscal-review-summary" role="status">
          <strong>Transmissão registrada: {data.submission.status}</strong>
          <p>Chave: {data.submission.access_key||"Aguardar consulta"} · Protocolo: {data.submission.protocol||"Não confirmado"}</p>
          <p>Não tente enviar novamente uma operação com resultado desconhecido.</p>
        </div>}
        <div className="fiscal-review-form">
          <label>Veículo
            <select value={vehicle} onChange={e=>setVehicle(e.target.value)} disabled={!!data.submission}>
              <option value="">Selecione</option>{data.vehicles.map(x=><option key={x.id} value={x.id}>{x.nickname||x.plate} · {x.plate}</option>)}
            </select>
          </label>
          <label>Motorista
            <select value={driver} onChange={e=>setDriver(e.target.value)} disabled={!!data.submission}>
              <option value="">Selecione</option>{data.drivers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label>CFOP (conferir com contabilidade)
            <input value={config.cfop} onChange={e=>setConfig(c=>({...c,cfop:e.target.value}))} maxLength={4} placeholder="Ex.: 5352" disabled={!!data.submission}/>
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
              maxLength={120} placeholder="Ex.: COLCHÕES" disabled={!!data.submission}/>
          </label>
          <label>UF de licenciamento da placa
            <input value={config.uf_licenciamento} onChange={e=>setConfig(c=>({...c,uf_licenciamento:e.target.value.toUpperCase()}))}
              maxLength={2} placeholder="RJ" disabled={!!data.submission}/>
          </label>
          <label className="span-two fiscal-check-field">
            <input type="checkbox" checked={config.numbering_verified} onChange={e=>setConfig(c=>({...c,numbering_verified:e.target.checked}))} disabled={!!data.submission}/>
            Confirmei com o emissor anterior a sequência de CT-e e verifiquei que esta carga ainda não possui CT-e autorizado.
          </label>
        </div>
        <div className="fiscal-review-actions" style={{justifyContent:"flex-start"}}>
          <button className="button" type="button" onClick={()=>setCreating(creating==="driver"?null:"driver")} disabled={loading||!!data.submission}><Plus size={14}/> Novo motorista</button>
          <button className="button" type="button" onClick={()=>setCreating(creating==="vehicle"?null:"vehicle")} disabled={loading||!!data.submission}><Plus size={14}/> Novo veículo</button>
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
          <button className="button" onClick={()=>void save()} disabled={loading||!!data.submission||data.draft.status!=="draft"}><Save size={15}/> Salvar conferência</button>
        </div>
        <div className="fiscal-review-summary" role="status">
          <strong>{data.preview.ready?"Pré-validação completa — pronto para confirmação.":"Pendências que impedem transmissão:"}</strong>
          {data.preview.missing.length>0&&<ul>{data.preview.missing.map((m,i)=><li key={i}>{m}</li>)}</ul>}
          <p>O envio à SEFAZ somente acontece depois de sua confirmação expressa e do processamento pela DotCompany.</p>
        </div>
        <label className="fiscal-check-field"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}
          disabled={!data.preview.ready||!!data.submission}/>
          Conferi todos os dados, sei que o envio é real e autorizo a transmissão deste CT-e.
        </label>
        <div className="fiscal-review-actions">
          <button className="button primary" type="button" onClick={()=>void submit()}
            disabled={loading||!data.preview.ready||!consent||!!data.submission}><Send size={16}/> Confirmar e enviar à SEFAZ</button>
        </div>
      </>}
      {error&&<p className="fiscal-inline-alert" role="alert"><ShieldAlert size={16}/>{error}</p>}
      {message&&<p className="fiscal-inline-alert" role="status">{message}</p>}
    </section>
  </div>}
 </>;
}
