import { Header, SectionTitle } from "@/components/ui";
import { FiscalImportForm } from "@/components/fiscal/import-form";
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
export default async function FiscalPage() {
  const client = await createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)redirect("/login");
  const {data:ws}=await client.from("workspaces").select("id").eq("kind","prime").single();
  const db=client as unknown as SupabaseClient;
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
    <div className="notice">
      Modo de preparação: não há emissão fiscal ativa. CT-e e MDF-e nesta tela são RASCUNHOS,
      sem XML assinado, número fiscal, autorização, protocolo ou validade na SEFAZ.
    </div>
    <div style={{marginTop:18}}><FiscalImportForm/></div>
    <SectionTitle title="Rascunhos de CT-e" />
    {error&&<div className="notice">Banco fiscal indisponível: {error.message}</div>}
    <div className="table-wrap">
      <table><thead><tr>
       <th>Criado em</th><th>Carga</th><th>NF-e</th><th>Origem e destino</th>
       <th>Mercadoria</th><th>Frete</th><th>CIOT</th><th>Situação</th>
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
        </tr>)}
        {ctes.length===0&&<tr><td colSpan={8}>Nenhum CT-e em preparação.</td></tr>}
      </tbody></table>
    </div>
    <SectionTitle title="Manifesto MDF-e — preparação" hint="Associado à carga da Ortobom"/>
    <MdfeDraftForm cteDrafts={choices}/>
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
