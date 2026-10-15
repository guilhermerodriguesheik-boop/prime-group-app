import { Header, SectionTitle } from "@/components/ui";
import { FiscalImportForm } from "@/components/fiscal/import-form";
import { OrtobomCargoForm } from "@/components/fiscal/ortobom-cargo-form";
import { FiscalAiPanel } from "@/components/fiscal/fiscal-ai-panel";
import { FiscalAiReview } from "@/components/fiscal/ai-review";
import { GmailConnector } from "@/components/fiscal/gmail-connector";
import { gmailStatus } from "@/lib/fiscal/gmail";
import { MdfeDraftForm } from "@/components/fiscal/mdfe-draft-form";
import { mdfeTransmissionBlockers } from "@/lib/fiscal/preflight";
import { fiscalIntegrationState } from "@/lib/fiscal/focus";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

type Draft = {
  id:string; document_type:string; cargo_reference:string|null;ciot:string|null;
  freight_value:number|null;status:string;created_at:string;
  checklist:{vehicle_plate?:string;origin_uf?:string;destination_uf?:string;source_cte_draft_id?:string}|null;
  fiscal_nfe_inbox:{invoice_number:string;sender_name:string;recipient_name:string;origin_city:string;destination_city:string;goods_value:number}|null;
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
  const gmail=ws ? await gmailStatus(ws.id).catch(()=>null) : null;
  const gmailReady=Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.GOOGLE_GMAIL_CLIENT_ID&&process.env.GOOGLE_GMAIL_CLIENT_SECRET&&process.env.GMAIL_TOKEN_ENCRYPTION_KEY&&process.env.APP_BASE_URL);
  const [vehiclesResult,driversResult,profileResult]=await Promise.all([
    ws?db.from("vehicles").select("id,nickname,plate").eq("workspace_id",ws.id).eq("status","active"):Promise.resolve({data:[]}),
    ws?db.from("drivers").select("id,name,document").eq("workspace_id",ws.id).eq("active",true):Promise.resolve({data:[]}),
    ws?db.from("fiscal_transport_profiles").select("rntrc").eq("workspace_id",ws.id).maybeSingle():Promise.resolve({data:null}),
  ]);
  const {data:rows,error}=ws
    ? await db.from("fiscal_drafts").select("id,document_type,cargo_reference,ciot,freight_value,status,created_at,checklist,fiscal_nfe_inbox(invoice_number,sender_name,recipient_name,origin_city,destination_city,goods_value)")
       .eq("workspace_id",ws.id).order("created_at",{ascending:false}).limit(100)
    : {data:[],error:null};
  const drafts=(rows??[]) as unknown as Draft[];
  const ctes=drafts.filter(x=>x.document_type==="cte");
  const manifests=drafts.filter(x=>x.document_type==="mdfe");
  const choices=ctes.filter(x=>x.status==="draft")
    .map(x=>({id:x.id,label:"Carga "+(x.cargo_reference||"sem numero")+" — NF-e "+(x.fiscal_nfe_inbox?.invoice_number||"nao informada")}));
  return <>
    <Header title="Prime Emissor Fiscal" subtitle="NF-e Ortobom, rascunhos de CT-e e preparação de MDF-e da Prime Group."/>
    {query.gmail==="connected"&&gmail&&<div className="fiscal-alert fiscal-alert-success" role="status"><strong>Gmail autorizado.</strong> Conta vinculada ao Prime Finance. Agora você pode importar os e-mails da Ortobom.</div>}
    {query.gmail==="connection_failed"&&<div className="fiscal-alert fiscal-alert-error" role="alert"><strong>Conexão Gmail não concluída.</strong><span>{oauthMessages[query.reason||"unexpected"]||oauthMessages.unexpected}</span><small>Diagnóstico: {Object.hasOwn(oauthMessages,query.reason||"")?query.reason:"unexpected"}</small></div>}
    {query.gmail==="setup_required"&&<div className="fiscal-alert fiscal-alert-error" role="alert"><strong>Antes de conectar o Gmail, entre no Prime Finance com a conta proprietária.</strong></div>}
    {query.gmail==="connected"&&!gmail&&<div className="fiscal-alert fiscal-alert-error" role="alert"><strong>O retorno do Google foi recebido, mas o registro da conexão não está disponível no banco.</strong></div>
    <div className="notice">
      Modo de preparação: não há emissão fiscal ativa. CT-e e MDF-e nesta tela são RASCUNHOS,
      sem XML assinado, número fiscal, autorização, protocolo ou validade na SEFAZ.
    </div>
    <div className="quick"><a href="/motoristas">Motoristas cadastrados</a><a href="/frota">Veículos</a><a href="/cadastros/transporte">RNTRC e transporte</a><a href="/assistente">Analisar com IA</a></div>
    {ws&&<div style={{marginTop:18}}><GmailConnector ready={gmailReady} connected={Boolean(gmail)} lastSync={gmail?.last_sync_at||null} lastError={gmail?.last_error||null}/></div>}
    <div style={{marginTop:18}}><OrtobomCargoForm/></div>
    <SectionTitle title="Inteligência artificial — cargas e frota"/>
    <FiscalAiPanel/>
    <div className="notice" style={{marginTop:12}}>
      Importação automática de novos e-mails: conector Google Apps Script disponível,
      aguardando ativação na conta Gmail e credenciais do servidor.
      Para conferir o registro ANTT, consulte{" "}
      <a target="_blank" rel="noopener noreferrer" href="https://consultapublica.antt.gov.br/Site/ConsultaRNTRC.aspx">
        RNTRC por transportador ou placa
      </a>.
    </div>
    <SectionTitle title="Importação individual de NF-e"/>
    <FiscalImportForm/>
    <SectionTitle title="Rascunhos de CT-e" />
    {error&&<div className="notice">Banco fiscal indisponível: {error.message}</div>}
    <div className="table-wrap">
      <table><thead><tr>
       <th>Criado em</th><th>Carga</th><th>NF-e</th><th>Origem e destino</th>
       <th>Mercadoria</th><th>Frete</th><th>CIOT</th><th>Situação</th><th>IA</th>
      </tr></thead><tbody>
        {ctes.map(x=><tr key={x.id}>
          <td>{new Date(x.created_at).toLocaleDateString("pt-BR")}</td>
          <td>{x.cargo_reference||"—"}</td>
          <td>{x.fiscal_nfe_inbox?.invoice_number||"—"}</td>
          <td>{x.fiscal_nfe_inbox?.origin_city||"—"} → {x.fiscal_nfe_inbox?.destination_city||"—"}</td>
          <td>{money(x.fiscal_nfe_inbox?.goods_value??null)}</td>
          <td>{money(x.freight_value)}</td>
          <td>{x.ciot||"—"}</td>
          <td>{x.status==="draft"?"RASCUNHO — não emitido":x.status}</td>
          <td><FiscalAiReview draftId={x.id}/></td>
        </tr>)}
        {ctes.length===0&&<tr><td colSpan={9}>Nenhum CT-e em preparação.</td></tr>}
      </tbody></table>
    </div>
    <SectionTitle title="Manifesto MDF-e — preparação" hint="Associado à carga da Ortobom"/>
    <MdfeDraftForm cteDrafts={choices}
      vehicles={(vehiclesResult.data||[]).filter(v=>v.plate).map(v=>({id:v.id,name:v.nickname,plate:v.plate as string}))}
      drivers={(driversResult.data||[]).filter(d=>d.document).map(d=>({id:d.id,name:d.name,cpf:d.document as string}))}
      rntrc={(profileResult.data as {rntrc:string|null}|null)?.rntrc||""}/>
    <div className="table-wrap" style={{marginTop:18}}>
      <table><thead><tr><th>Data</th><th>Carga</th><th>Placa</th><th>Percurso</th><th>Situação</th></tr></thead><tbody>
      {manifests.map(x=><tr key={x.id}>
        <td>{new Date(x.created_at).toLocaleDateString("pt-BR")}</td>
        <td>{x.cargo_reference||"—"}</td>
        <td>{x.checklist?.vehicle_plate||"—"}</td>
        <td>{x.checklist?.origin_uf||"—"} → {x.checklist?.destination_uf||"—"}</td>
        <td>RASCUNHO — não emitido</td>
      </tr>)}
      {manifests.length===0&&<tr><td colSpan={5}>Nenhum manifesto preparado.</td></tr>}
      </tbody></table>
    </div>
    <SectionTitle title="Conexão com o autorizador fiscal"/>
    <div className="notice">
      Focus NFe CT-e/MDF-e — homologação: {fiscalIntegrationState().homologacao?"credencial configurada":"sem credencial"};
      produção: {fiscalIntegrationState().producao?"credencial configurada":"sem credencial"}.
      Os rascunhos desta tela não são documentos autorizados. A integração de emissão
      e os retornos da SEFAZ precisam estar habilitados no ambiente da empresa.
    </div>
    <SectionTitle title="Pendências para emissão fiscal real"/>
    <div className="notice">
      <ul style={{margin:"8px 0 0",paddingLeft:20}}>
        {mdfeTransmissionBlockers().map(reason=><li key={reason}>{reason}</li>)}
      </ul>
      Também devem ser revisados tomador, CFOP, tributos, município IBGE, número/série,
      credenciamento e os arquivos XSD vigentes. Nunca usamos o valor da mercadoria como frete.
      A IA pode auxiliar o preenchimento, mas não autoriza documentos sozinha.
    </div>
  </>;
}
