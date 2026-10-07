import { Header, SectionTitle } from "@/components/ui";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { createClient } from "@/lib/supabase/server";
import { shortDate, workspaceLabel } from "@/lib/finance/format";

export default async function Page(){
  const supabase=await createClient();
  const [{data:workspaces},{data:documents}]=await Promise.all([
    supabase.from("workspaces").select("id,name,kind").order("kind"),
    supabase.from("documents").select("id,workspace_id,filename,mime_type,size_bytes,document_type,created_at").order("created_at",{ascending:false}).limit(50),
  ]);

  const ws=workspaces??[];
  const wsMap=new Map(ws.map(item=>[item.id,item]));

  return <><Header title="Documentos" subtitle="Notas, recibos, XML, CT-e, faturas e comprovantes."/>
    <div className="grid grid-2">
      <DocumentUploader workspaces={ws.map(item=>({id:item.id,name:item.name}))}/>
      <div className="card"><h3>Entrada inteligente</h3><div className="metric-value">Foto, PDF ou XML</div><div className="metric-foot">Arquivos ficam privados no Supabase. A próxima etapa é extrair valor, fornecedor, categoria, veículo e viagem com IA.</div></div>
    </div>
    <SectionTitle title="Arquivos enviados"/>
    <div className="table-wrap"><table><thead><tr><th>Data</th><th>Arquivo</th><th>Ambiente</th><th>Tipo</th><th>Tamanho</th></tr></thead><tbody>
      {(documents??[]).map(item=><tr key={item.id}><td>{shortDate(item.created_at)}</td><td>{item.filename}</td><td>{workspaceLabel(wsMap.get(item.workspace_id)?.kind??"")}</td><td>{item.document_type??"—"}</td><td>{item.size_bytes?Math.round(Number(item.size_bytes)/1024)+" KB":"—"}</td></tr>)}
      {!documents?.length&&<tr><td colSpan={5}>Nenhum documento enviado ainda.</td></tr>}
    </tbody></table></div>
    <SectionTitle title="Fluxo"/><div className="notice">Receber → interpretar → sugerir lançamento → confirmar → contabilizar. O mesmo pipeline será usado para arquivos recebidos pelo WhatsApp.</div>
  </>
}