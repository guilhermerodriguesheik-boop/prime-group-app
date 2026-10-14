import { Header, SectionTitle } from "@/components/ui";
import { FiscalImportForm } from "@/components/fiscal/import-form";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

type Draft = {
  id:string; cargo_reference:string|null;ciot:string|null;freight_value:number|null;
  status:string;created_at:string;
  fiscal_nfe_inbox: {invoice_number:string;sender_name:string;recipient_name:string;origin_city:string;destination_city:string;goods_value:number}|null;
};
const money = (n: number | null) => n === null ? "Nao informado" : n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export default async function FiscalPage() {
  const client = await createClient();
  const {data:{user}}=await client.auth.getUser();
  if (!user) redirect("/login");
  const {data:ws}=await client.from("workspaces").select("id").eq("kind","prime").single();
  const db = client as unknown as SupabaseClient;
  const {data:rows,error} = ws
    ? await db.from("fiscal_drafts").select("id,cargo_reference,ciot,freight_value,status,created_at,fiscal_nfe_inbox(invoice_number,sender_name,recipient_name,origin_city,destination_city,goods_value)")
      .eq("workspace_id",ws.id).order("created_at",{ascending:false}).limit(30)
    : {data:[],error:null};
  const drafts = (rows ?? []) as unknown as Draft[];
  return <>
    <Header title="Prime Emissor Fiscal" subtitle="Recebimento de NF-e e preparacao de CT-e e MDF-e para a Prime Group." />
    <div className="notice">
      Fase segura de preparacao: nenhum CT-e ou MDF-e e transmitido nesta tela.
      Transmissao, assinatura A1, autorizacao SEFAZ e PDF fiscal ainda dependem do motor homologado.
    </div>
    <div style={{marginTop:18}}><FiscalImportForm/></div>
    <SectionTitle title="Rascunhos de CT-e" />
    {error && <div className="notice">Modulo aguardando migracao do banco: {error.message}</div>}
    <div className="table-wrap">
      <table><thead><tr>
        <th>Criado em</th><th>Carga</th><th>NF-e</th><th>Origem e destino</th>
        <th>Mercadoria</th><th>Frete</th><th>CIOT</th><th>Situacao</th>
      </tr></thead><tbody>
        {drafts.map(item => <tr key={item.id}>
          <td>{new Date(item.created_at).toLocaleDateString("pt-BR")}</td>
          <td>{item.cargo_reference||"—"}</td>
          <td>{item.fiscal_nfe_inbox?.invoice_number||"—"}</td>
          <td>{item.fiscal_nfe_inbox?.origin_city||"—"} → {item.fiscal_nfe_inbox?.destination_city||"—"}</td>
          <td>{money(item.fiscal_nfe_inbox?.goods_value ?? null)}</td>
          <td>{money(item.freight_value)}</td>
          <td>{item.ciot||"—"}</td>
          <td>{item.status==="draft"?"RASCUNHO — nao emitido":item.status}</td>
        </tr>)}
        {drafts.length===0 && <tr><td colSpan={8}>Nenhuma NF-e importada para preparar um CT-e.</td></tr>}
      </tbody></table>
    </div>
    <div className="notice" style={{marginTop:18}}>
      Antes de emitir sera necessario conferir tomador do servico, origem fiscal, destino,
      placa, motorista, RNTRC, tributacao e numeracao. A NF-e nao substitui essas informacoes.
      O valor da mercadoria nunca e usado como valor do frete.
    </div>
  </>;
}
