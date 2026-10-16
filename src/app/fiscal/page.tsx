import { Header } from "@/components/ui";
import { FiscalImportForm } from "@/components/fiscal/import-form";
import { OrtobomCargoForm } from "@/components/fiscal/ortobom-cargo-form";
import { FiscalAiPanel } from "@/components/fiscal/fiscal-ai-panel";
import { FiscalAiReview } from "@/components/fiscal/ai-review";
import { CteSendReview } from "@/components/fiscal/cte-send-review";
import { GmailConnector } from "@/components/fiscal/gmail-connector";
import { gmailStatus, gmailClientStatus } from "@/lib/fiscal/gmail";
import { fiscalReadiness } from "@/lib/fiscal/readiness";
import { FiscalReadinessPanel } from "@/components/fiscal/readiness-panel";
import { DotcompanyPanel } from "@/components/fiscal/dotcompany-panel";
import { AnttMonthlyCheck } from "@/components/fiscal/antt-monthly-check";
import { FiscalTabs,FiscalTabPanel } from "@/components/fiscal/fiscal-tabs";
import { OrtobomFinancePanel } from "@/components/fiscal/ortobom-finance-panel";
import { canonicalCargo } from "@/lib/fiscal/ortobom-finance-parser";
import { MdfeDraftForm } from "@/components/fiscal/mdfe-draft-form";
import { mdfeTransmissionBlockers, canPrepareNewCte } from "@/lib/fiscal/preflight";
import { fiscalIntegrationState } from "@/lib/fiscal/focus";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

type Draft = {
  id:string; document_type:string; cargo_reference:string|null;ciot:string|null;
  freight_value:number|null;status:string;created_at:string;
  checklist:{vehicle_plate?:string;origin_uf?:string;destination_uf?:string;source_cte_draft_id?:string;previous_external_cte_number?:string;previous_external_cte_series?:string;previous_external_cte_key?:string;do_not_issue_duplicate?:boolean}|null;
  fiscal_nfe_inbox:{invoice_number:string;sender_name:string;recipient_name:string;origin_city:string;destination_city:string;origin_uf:string;destination_uf:string;goods_value:number}|null;
};
const money = (n:number|null)=>n===null?"Nao informado":n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export default async function FiscalPage({searchParams}:{searchParams:Promise<{gmail?:string;reason?:string}>}) {
  const query=await searchParams;
  const oauthMessages:Record<string,string>={
    invalid_state:"A sessão de conexão expirou ou o cookie foi bloqueado. Tente novamente a partir deste mesmo navegador.",
    not_authorized:"O Google não concluiu a autorização de leitura. Verifique o usuário de teste e permita a leitura do Gmail.",
    invalid_client:"O Google rejeitou a credencial OAuth. O ID e a chave do cliente precisam ser conferidos na Vercel.",
    invalid_grant:"O código de autorização expirou ou foi usado antes. Inicie uma nova conexão.",
    token_denied:"O Google recusou a troca do código. Confira o cliente OAuth e a URI de redirecionamento.",
    missing_refresh:"O Google não forneceu acesso contínuo. Revogue o acesso anterior ao Prime Finance na Conta Google e tente conectar novamente.",
    wrong_google_account:"Você autorizou outra conta. Escolha lgtransporteelogistica@gmail.com no Google.",
    supabase_access:"A chave de acesso administrativo do Supabase ainda não está operante no servidor.",
    database_write:"O Gmail foi autorizado, mas o Supabase rejeitou o armazenamento da conexão. O sistema precisa corrigir o acesso ao banco.",
    gmail_profile:"O Gmail não confirmou a conta autorizada. Verifique se a API Gmail está habilitada no Google Cloud.",
    session_or_workspace:"Seu login do Prime Finance não foi reconhecido no retorno do Google. Entre novamente no aplicativo e repita a conexão.",
    unexpected:"A conexão encontrou um erro inesperado e não foi gravada.",
  };
  const client = await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)redirect("/login");
  const {data:ws}=await client.from("workspaces").select("id").eq("kind","prime").eq("owner_id",user.id).maybeSingle();
  const db=client as unknown as SupabaseClient;
  const [gmail,googleClient]=await Promise.all([
    ws?gmailStatus(ws.id).catch(()=>null):Promise.resolve(null),
    gmailClientStatus(),
  ]);
  const gmailReady=Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.GOOGLE_GMAIL_CLIENT_ID&&process.env.GOOGLE_GMAIL_CLIENT_SECRET&&process.env.GMAIL_TOKEN_ENCRYPTION_KEY&&process.env.APP_BASE_URL);
  const {count:invoiceCount}=ws?await db.from("fiscal_nfe_inbox").select("id",{count:"exact",head:true}).eq("workspace_id",ws.id):{count:0};
  const [vehiclesResult,driversResult,profileResult]=await Promise.all([
    ws?db.from("vehicles").select("id,nickname,plate").eq("workspace_id",ws.id).eq("status","active"):Promise.resolve({data:[]}),
    ws?db.from("drivers").select("id,name,document").eq("workspace_id",ws.id).eq("active",true):Promise.resolve({data:[]}),
    ws?db.from("fiscal_transport_profiles").select("rntrc").eq("workspace_id",ws.id).maybeSingle():Promise.resolve({data:null}),
  ]);
  const {data:historicalRows}=ws?await db.from("cte_documents")
    .select("access_key,number,series,issued_at,total_value,status")
    .eq("workspace_id",ws.id).eq("source","gmail_dacte")
    .order("issued_at",{ascending:false}).limit(15):{data:[]};
  const historicalCtes=historicalRows||[];
  const {data:rows,error}=ws
    ? await db.from("fiscal_drafts").select("id,document_type,cargo_reference,ciot,freight_value,status,created_at,checklist,fiscal_nfe_inbox(invoice_number,sender_name,recipient_name,origin_city,destination_city,origin_uf,destination_uf,goods_value)")
       .eq("workspace_id",ws.id).order("created_at",{ascending:false}).limit(100)
    : {data:[],error:null};
  const drafts=(rows??[]) as unknown as Draft[];
  const {data:transmissions}=ws?await db.from("fiscal_cte_transmissions")
    .select("draft_id,status,access_key,protocol").eq("workspace_id",ws.id):{data:[]};
  const transmissionsByDraft=new Map((transmissions||[]).map(x=>[x.draft_id,x]));
  const ctes=drafts.filter(x=>x.document_type==="cte");
  type FinanceLine={cargo_reference:string;cte_number:string|null;declared_freight:number|string|null;
   declared_advance:number|string|null;declared_balance:number|string|null};
  type FinanceEmail={id:string;event_kind:string;payment_date:string|null;period_start:string|null;period_end:string|null;
   declared_bank_deposit:number|string|null;declared_promissory_discount:number|string|null;
   ortobom_financial_lines:FinanceLine[]};
  const {data:financialData}=ws?await db.from("ortobom_financial_emails")
    .select("id,event_kind,payment_date,period_start,period_end,declared_bank_deposit,declared_promissory_discount,ortobom_financial_lines(cargo_reference,cte_number,declared_freight,declared_advance,declared_balance)")
    .eq("workspace_id",ws.id).order("email_date",{ascending:false}).limit(300):{data:[]};
  const financeEmails=(financialData||[]) as unknown as FinanceEmail[];
  const cargoData=new Map<string,{cargo:string;freight:number|null;claimed:number|null;advance:number;balance:number|null;cte:string|null;status:string}>();
  for(const e of [...financeEmails].reverse()){
   for(const l of e.ortobom_financial_lines||[]){
    const key=canonicalCargo(l.cargo_reference);
    const known=cargoData.get(key)||{cargo:key.padStart(6,"0"),freight:null,claimed:null,advance:0,balance:null,cte:null,status:"Aguardando cruzamento"};
    if(e.event_kind==="advance"&&l.declared_advance!==null){
     known.advance+=Number(l.declared_advance);
    }
    if(l.declared_freight!==null)known.claimed=Number(l.declared_freight);
    if(e.event_kind==="period_payment"&&l.declared_balance!==null)known.balance=Number(l.declared_balance);
    if(l.cte_number)known.cte=l.cte_number;
    cargoData.set(key,known);
   }
  }
  for(const item of ctes){
   const key=canonicalCargo(item.cargo_reference||"");
   const target=cargoData.get(key);
   if(target)target.freight=item.freight_value===null?null:Number(item.freight_value);
  }
  for(const item of cargoData.values()){
   item.status=item.freight===null?"Sem carga no app":item.claimed!==null&&Math.abs(item.freight-item.claimed)>0.01?
    "Divergência de frete":"Conferir recebimento bancário";
  }
  const {data:bankDeposits}=ws?await db.from("bank_transactions")
   .select("id,occurred_on,amount,direction,provider_status")
   .eq("workspace_id",ws.id).eq("direction","credit")
   .gte("occurred_on","2026-01-01").limit(1500):{data:[]};
  const postedDeposits=(bankDeposits||[]).filter(x=>x.provider_status==="POSTED");
  const matchedBankIds=new Set<string>();
  const bankStatus=(paymentDay:string|null,value:number|null)=>{
   if(!paymentDay||value===null)return "Sem dados suficientes";
   const date=new Date(paymentDay+"T12:00:00Z").getTime();
   const possible=postedDeposits.filter(x=>{
    if(matchedBankIds.has(x.id)||Math.abs(Number(x.amount)-value)>0.009)return false;
    const delta=Math.abs(new Date(x.occurred_on+"T12:00:00Z").getTime()-date)/86400000;
    return delta<=3;
   }).sort((a,b)=>Math.abs(new Date(a.occurred_on).getTime()-date)-Math.abs(new Date(b.occurred_on).getTime()-date));
   if(!possible.length)return "Sem crédito correspondente";
   // A single match by same date and exact value is a strong bank match, not a SEFAZ or invoice status.
   if(possible.length>1)return "Múltiplos créditos possíveis";
   matchedBankIds.add(possible[0].id);
   return possible[0].occurred_on===paymentDay?"Crédito compatível no extrato":"Crédito próximo à data — conferir";
  };
  const financePeriods=financeEmails.filter(e=>e.event_kind==="period_payment").map(e=>({
   id:e.id,date:e.payment_date,
   period:[e.period_start,e.period_end].filter(Boolean).join(" a ")||"Não especificado",
   deposit:e.declared_bank_deposit===null?null:Number(e.declared_bank_deposit),
   promissory:e.declared_promissory_discount===null?null:Number(e.declared_promissory_discount),
   loads:e.ortobom_financial_lines?.length||0,
   bankMatch:bankStatus(e.payment_date,e.declared_bank_deposit===null?null:Number(e.declared_bank_deposit)),
  }));

  const manifests=drafts.filter(x=>x.document_type==="mdfe");
  const choices=ctes.filter(x=>canPrepareNewCte(x.status,x.checklist))
    .map(x=>({id:x.id,label:"Carga "+(x.cargo_reference||"sem numero")+" — NF-e "+(x.fiscal_nfe_inbox?.invoice_number||"nao informada"),
      originUf:x.fiscal_nfe_inbox?.origin_uf||"",destinationUf:x.fiscal_nfe_inbox?.destination_uf||""}));
  const pending=ctes.filter(x=>x.status==="draft").length;
  return (
    <>
      <Header title="Emissor Fiscal" subtitle="Operações de transporte, importação Ortobom e preparação de documentos da Prime Group." />
      <div className="fiscal-workspace">
        <section className="fiscal-hero" aria-label="Visão geral fiscal">
          <div className="fiscal-hero-content">
            <span className="fiscal-overline"><span className="fiscal-pulse"/> PRIME GROUP / CENTRAL FISCAL</span>
            <h2>Da carga recebida ao manifesto, em um só lugar.</h2>
            <p>Organize NF-e da Ortobom, CIOT, fretes e documentos da operação. Os arquivos importados ficam disponíveis para conferência antes de qualquer emissão.</p>
            <div className="fiscal-hero-cta">
              <a href="#module-cargas" className="fiscal-hero-button">Conectar cargas <span aria-hidden="true">↗</span></a>
              <a href="#module-cte" className="fiscal-hero-textlink">Ver fila de CT-e <span aria-hidden="true">→</span></a>
            </div>
          </div>
          <div className="fiscal-hero-metrics">
            <div><span>CT-e em preparação</span><strong>{pending.toLocaleString("pt-BR")}</strong><small>Rascunhos sem autorização fiscal</small></div>
            <div><span>NF-e carregadas</span><strong>{(invoiceCount||0).toLocaleString("pt-BR")}</strong><small>XMLs das notas armazenados</small></div>
            <div><span>MDF-e em preparação</span><strong>{manifests.length.toLocaleString("pt-BR")}</strong><small>Manifestos ainda não transmitidos</small></div>
          </div>
        </section>
        {query.gmail==="connected"&&gmail&&<div className="fiscal-alert fiscal-alert-success" role="status"><strong>Gmail autorizado e vinculado.</strong><span>Você já pode importar os e-mails da Ortobom.</span></div>}
        {query.gmail==="connection_failed"&&<div className="fiscal-alert fiscal-alert-error" role="alert">
          <strong>Não foi possível concluir a conexão com o Google.</strong>
          <span>{oauthMessages[query.reason||"unexpected"]||oauthMessages.unexpected}</span>
          <small>Código do diagnóstico: {query.reason||"unexpected"}</small>
        </div>}
        {query.gmail==="setup_required"&&<div className="fiscal-alert fiscal-alert-error" role="alert">Entre com a conta proprietária do Prime Finance antes de conectar o Gmail.</div>}
        {query.gmail==="connected"&&!gmail&&<div className="fiscal-alert fiscal-alert-error" role="alert">O Google retornou ao aplicativo, mas não foi localizado o registro da conexão no banco.</div>}
        <FiscalTabs>
          <FiscalTabPanel tab="cargas">
        <section id="gmail-integration">
          <div className="fiscal-section-intro"><div><span className="fiscal-section-kicker">01 / CONEXÃO DE DADOS</span><h2>Importação de cargas</h2><p>Receba os XMLs sem digitar novamente os dados da viagem.</p></div><span className={"fiscal-connection-status "+(gmail?"is-live":"is-pending")}>{gmail?"Gmail vinculado":"Conexão pendente"}</span></div>
          <div className="fiscal-connect-layout">
            {ws&&<GmailConnector ready={gmailReady} clientStatus={googleClient} connected={Boolean(gmail)} lastSync={gmail?.last_sync_at||null} lastError={gmail?.last_error||null}/>}
            <aside className="fiscal-playbook">
              <span className="fiscal-small-label">FLUXO DA OPERAÇÃO</span>
              <h3>Uma carga. Um frete. Todas as notas.</h3>
              <ol className="fiscal-steps">
                <li><span>01</span><div><strong>Receber da Ortobom</strong><small>XMLs, referência da carga, valor e CIOT.</small></div></li>
                <li><span>02</span><div><strong>Conferir com IA</strong><small>Revisar divergências antes de preparar o CT-e.</small></div></li>
                <li><span>03</span><div><strong>Vincular veículo e motorista</strong><small>Preencher o MDF-e com os cadastros da Prime.</small></div></li>
              </ol>
              <a href="/cadastros/transporte" className="fiscal-playbook-link">Abrir cadastro de transporte <span>↗</span></a>
            </aside>
          </div>
        </section>
          </FiscalTabPanel>
          <FiscalTabPanel tab="integracoes">
        <section id="fiscal-provider">
          <div className="fiscal-section-intro"><div><span className="fiscal-section-kicker">AUTORIZADOR / SANDBOX</span><h2>Integração fiscal DotCompany</h2><p>Valide a chave e confira os documentos sem solicitar uma emissão real.</p></div></div>
          <DotcompanyPanel drafts={[...ctes].sort((a,b)=>Number(canPrepareNewCte(b.status,b.checklist))-Number(canPrepareNewCte(a.status,a.checklist))).map(x=>({id:x.id,label:"Carga "+(x.cargo_reference||"sem referência")+" · "+(canPrepareNewCte(x.status,x.checklist)?"para preparar":"bloqueada / conferência")}))}/>
        </section>
          </FiscalTabPanel>
          <FiscalTabPanel tab="cte">
        <section id="cte-queue">
          <div className="fiscal-section-intro"><div><span className="fiscal-section-kicker">02 / DOCUMENTOS</span><h2>Fila de CT-e</h2><p>Lista real das cargas cadastradas; rascunhos não equivalem a documentos autorizados.</p></div><span className="fiscal-count">{ctes.length} {ctes.length===1?"registro":"registros"}</span></div>
          {error&&<div className="fiscal-alert fiscal-alert-error">Consulta fiscal indisponível: {error.message}</div>}
          <div className="table-wrap fiscal-data-table">
            <table><thead><tr><th>Criado em</th><th>Carga</th><th>NF-e</th><th>Origem / destino</th><th>Mercadoria</th><th>Frete</th><th>CIOT</th><th>Situação</th><th>Revisão</th><th>Envio SEFAZ</th></tr></thead>
              <tbody>{ctes.map(x=><tr key={x.id}>
                <td>{new Date(x.created_at).toLocaleDateString("pt-BR")}</td>
                <td><strong className="fiscal-cargo-id">{x.cargo_reference||"—"}</strong></td>
                <td>{x.fiscal_nfe_inbox?.invoice_number||"—"}</td>
                <td>{x.fiscal_nfe_inbox?.origin_city||"—"} → {x.fiscal_nfe_inbox?.destination_city||"—"}</td>
                <td>{money(x.fiscal_nfe_inbox?.goods_value??null)}</td>
                <td><strong>{money(x.freight_value)}</strong></td>
                <td>{x.ciot||"—"}</td>
                <td>{transmissionsByDraft.get(x.id)?
                  <span className="fiscal-draft-status">{transmissionsByDraft.get(x.id)?.status==="authorized"?"CT-e autorizado":
                    transmissionsByDraft.get(x.id)?.status==="indeterminate"?"Verificar na DotCompany":
                    transmissionsByDraft.get(x.id)?.status==="rejected"?"Rejeitado na SEFAZ":"Transmissão em andamento"}</span>:
                  x.checklist?.do_not_issue_duplicate?
                  <span className="fiscal-cte-external" title="Referência de DACTE externo identificada. O protocolo precisa de conferência SEFAZ.">
                    CT-e externo nº {x.checklist.previous_external_cte_number||"—"} · verificar
                  </span>:
                  <span className="fiscal-draft-status">{x.status==="draft"?"Rascunho":x.status==="review_pending"?"Pendente de revisão":x.status}</span>}
                </td>
                <td><FiscalAiReview draftId={x.id}/></td><td><CteSendReview draftId={x.id}/></td>
              </tr>)}
              {ctes.length===0&&<tr><td colSpan={10} className="fiscal-empty">Nenhuma carga importada. Comece conectando o Gmail ou enviando os XMLs.</td></tr>}</tbody>
            </table>
          </div>
        </section>
        {historicalCtes.length>0&&<section aria-label="CT-es emitidos fora do Prime Finance">
          <div className="fiscal-section-intro"><div><span className="fiscal-section-kicker">REGISTROS RECUPERADOS DO GMAIL</span>
            <h2>CT-e já enviados pelo Cargozilla</h2>
            <p>Documentos existentes identificados nos DACTEs enviados à Ortobom. O protocolo impresso ainda precisa de consulta oficial na SEFAZ.</p>
          </div><span className="fiscal-count">{historicalCtes.length} identificados</span></div>
          <div className="table-wrap fiscal-data-table"><table><thead><tr><th>Número</th><th>Série</th><th>Data</th><th>Frete</th><th>Chave CT-e</th><th>Situação</th></tr></thead>
          <tbody>{historicalCtes.map(x=><tr key={x.access_key}>
            <td><strong>{x.number||"—"}</strong></td><td>{x.series||"—"}</td>
            <td>{x.issued_at?new Date(x.issued_at).toLocaleDateString("pt-BR"):"—"}</td>
            <td>{money(x.total_value===null?null:Number(x.total_value))}</td>
            <td><span className="fiscal-key-truncate" title={x.access_key||""}>{x.access_key||"—"}</span></td>
            <td><span className="fiscal-cte-external">DACTE recebido · consultar SEFAZ</span></td>
          </tr>)}</tbody></table></div>
        </section>}
          </FiscalTabPanel>
        <div className="fiscal-modular-grid">
          <FiscalTabPanel tab="ia"><section id="fiscal-assistant">
            <div className="fiscal-section-intro"><div><span className="fiscal-section-kicker">03 / INTELIGÊNCIA OPERACIONAL</span><h2>Conferência por IA</h2><p>Pergunte sobre cargas, notas, CIOT, motoristas e veículos.</p></div></div>
            <FiscalAiPanel/>
          </section></FiscalTabPanel>
          <FiscalTabPanel tab="cargas"><section id="manual-import">
            <div className="fiscal-section-intro"><div><span className="fiscal-section-kicker">ALTERNATIVA / IMPORTAÇÃO MANUAL</span><h2>Enviar documentos</h2><p>Utilize quando uma carga ainda não estiver no Gmail.</p></div></div>
            <div className="fiscal-manual-panel">
              <details><summary>Importar carga com múltiplas NF-e <span>+</span></summary><OrtobomCargoForm/></details>
              <details><summary>Importar uma NF-e individual <span>+</span></summary><FiscalImportForm/></details>
            </div>
          </section></FiscalTabPanel>
        </div>
        <FiscalTabPanel tab="mdfe">
        <section id="mdfe-manifest">
          <div className="fiscal-section-intro"><div><span className="fiscal-section-kicker">04 / VIAGEM</span><h2>Preparação do MDF-e</h2><p>Vincule a carga ao veículo e motorista. A emissão real depende de integração fiscal homologada.</p></div><a className="fiscal-outline-link" href="/cadastros/transporte">Gerenciar cadastros ↗</a></div>
          <div className="fiscal-manifest-grid">
            <MdfeDraftForm cteDrafts={choices}
              vehicles={(vehiclesResult.data||[]).filter(v=>v.plate).map(v=>({id:v.id,name:v.nickname,plate:v.plate as string}))}
              drivers={(driversResult.data||[]).filter(d=>d.document).map(d=>({id:d.id,name:d.name,cpf:d.document as string}))}
              rntrc={(profileResult.data as {rntrc:string|null}|null)?.rntrc||""}/>
            <aside className="fiscal-manifest-list">
              <h3>Manifestos preparados</h3>
              {manifests.length===0?<p>Os manifestos ficarão listados aqui assim que você preparar uma viagem.</p>:
                <div className="fiscal-manifest-items">{manifests.map(x=><div key={x.id} className="fiscal-manifest-item"><strong>{x.cargo_reference||"Sem referência"}</strong><span>{x.checklist?.vehicle_plate||"Placa pendente"}</span><small>{x.checklist?.origin_uf||"UF"} → {x.checklist?.destination_uf||"UF"} · Rascunho</small></div>)}</div>}
            </aside>
          </div>
        </section>
        </FiscalTabPanel>
        <FiscalTabPanel tab="financeiro">
        <OrtobomFinancePanel cargo={[...cargoData.values()].sort((a,b)=>b.cargo.localeCompare(a.cargo))}
          periods={financePeriods} emailCount={financeEmails.length} connected={Boolean(gmail)}/>
        </FiscalTabPanel>
        <FiscalTabPanel tab="integracoes">
        <AnttMonthlyCheck/>
        <section className="fiscal-readiness-section" aria-label="Condições de emissão fiscal">
          <span className="fiscal-section-kicker">CONTROLES DE EMISSÃO</span>
          <h2>O que já está pronto e o que ainda depende de homologação</h2>
          <FiscalReadinessPanel steps={fiscalReadiness({
             gmailConnected:Boolean(gmail),gmailClientAccepted:googleClient==="accepted",
             gmailClientRejected:googleClient==="rejected",nfeCount:invoiceCount||0,cteDraftCount:ctes.length,
             hasDriver:!!driversResult.data?.length,hasVehicle:!!vehiclesResult.data?.length,
             rntrcProvided:Boolean((profileResult.data as {rntrc:string|null}|null)?.rntrc),
             focusHomologation:fiscalIntegrationState().homologacao,
             focusProduction:fiscalIntegrationState().producao,
             authorizedCteCount:0,fiscalDataReviewed:false,
          })}/>
        </section>
        <footer className="fiscal-compliance">
          <div><span className="fiscal-section-kicker">EMISSÃO CONTROLADA</span><h3>Conferência fiscal e credenciamento</h3><p>Os CT-e e MDF-e desta tela são rascunhos, sem número, XML assinado ou protocolo SEFAZ. A IA ajuda a revisar, mas não transmite documentos.</p><p>DotCompany: {process.env.DOTCOMPANY_SANDBOX_API_KEY?.startsWith("dc_test_")?"chave Sandbox configurada":"chave Sandbox ausente"} · transmissão de produção desabilitada. Focus NFe (legado): homologação {fiscalIntegrationState().homologacao?"configurada":"não configurada"} · produção {fiscalIntegrationState().producao?"configurada":"não configurada"}.</p></div>
          <div><ul>{mdfeTransmissionBlockers().map(reason=><li key={reason}>{reason}</li>)}</ul><a href="https://consultapublica.antt.gov.br/Site/ConsultaRNTRC.aspx" target="_blank" rel="noopener noreferrer">Consultar RNTRC na ANTT ↗</a></div>
        </footer>
        </FiscalTabPanel>
        </FiscalTabs>
      </div>
    </>
  );
}
