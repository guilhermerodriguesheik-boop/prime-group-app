import Link from "next/link";
import { redirect } from "next/navigation";
import { Header, SectionTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { registerDriver,registerTransportVehicle,saveTransportRntrc } from "./actions";
import type { SupabaseClient } from "@supabase/supabase-js";
export default async function Page(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:ws}=await supabase.from("workspaces").select("id")
    .eq("kind","prime").eq("owner_id",user.id).maybeSingle();
  const db=supabase as unknown as SupabaseClient;
  const [drivers,vehicles,profile]=await Promise.all([
    ws?db.from("drivers").select("id,name,document,license_expires_on,active")
      .eq("workspace_id",ws.id).order("name"):{data:[]},
    ws?db.from("vehicles").select("id,nickname,plate,make,model,status")
      .eq("workspace_id",ws.id).order("nickname"):{data:[]},
    ws?db.from("fiscal_transport_profiles").select("rntrc")
      .eq("workspace_id",ws.id).maybeSingle():{data:null},
  ]);
  return <>
    <Header title="Cadastro de transporte" subtitle="Motoristas, veículos e RNTRC em um único local para CT-e, MDF-e e viagens."/>
    <p className="notice">O número RNTRC informado é declarado, não homologado automaticamente.
      Verifique a situação no site da ANTT antes de emitir qualquer documento fiscal.</p>
    <div className="quick">
      <a href="https://consultapublica.antt.gov.br/Site/ConsultaRNTRC.aspx"
         target="_blank" rel="noopener noreferrer">Consultar RNTRC / placa no portal oficial da ANTT ↗</a>
      <a href="https://consultapublica.antt.gov.br/Site/ConsultaCIOT.aspx"
         target="_blank" rel="noopener noreferrer">Validar CIOT no portal oficial da ANTT ↗</a>
      <Link href="/fiscal">Ir ao emissor fiscal</Link>
    </div>
    <div className="grid grid-2">
      <form action={saveTransportRntrc} className="card" style={{display:"grid",gap:10}}>
        <h3>Transportadora · RNTRC</h3>
        <label>Registro RNTRC <input name="rntrc" required inputMode="numeric"
          defaultValue={(profile.data as {rntrc?:string}|null)?.rntrc||""} placeholder="8 ou 9 dígitos"/></label>
        <button className="button" type="submit">Salvar número informado</button>
      </form>
      <form action={registerDriver} className="card" style={{display:"grid",gap:10}}>
        <h3>Cadastrar motorista</h3>
        <label>Nome <input required name="name" maxLength={120}/></label>
        <label>CPF <input required name="cpf" inputMode="numeric" maxLength={14}/></label>
        <label>CNH (opcional) <input name="cnh" maxLength={40}/></label>
        <label>Vencimento CNH <input type="date" name="cnhExpires"/></label>
        <label>Telefone <input name="phone" inputMode="tel"/></label>
        <button className="button" type="submit">Salvar motorista</button>
      </form>
      <form action={registerTransportVehicle} className="card" style={{display:"grid",gap:10}}>
        <h3>Cadastrar veículo</h3>
        <label>Placa <input required name="plate" maxLength={9} placeholder="ABC1D23"/></label>
        <label>Nome no app <input required name="nickname" maxLength={100} placeholder="Sprinter / Toco"/></label>
        <label>Marca <input name="make" maxLength={80}/></label>
        <label>Modelo <input name="model" maxLength={80}/></label>
        <button className="button" type="submit">Salvar veículo</button>
      </form>
    </div>
    <SectionTitle title="Motoristas cadastrados"/>
    <div className="table-wrap"><table><thead><tr><th>Nome</th><th>CPF</th><th>Validade CNH</th></tr></thead><tbody>
      {(drivers.data||[]).map((d:{id:string;name:string;document:string|null;license_expires_on:string|null})=><tr key={d.id}>
        <td>{d.name}</td><td>{d.document?("•••"+d.document.slice(-3)):"—"}</td><td>{d.license_expires_on||"Não informado"}</td>
      </tr>)}
      {!drivers.data?.length&&<tr><td colSpan={3}>Sem motorista cadastrado.</td></tr>}
    </tbody></table></div>
    <SectionTitle title="Veículos cadastrados"/>
    <div className="table-wrap"><table><thead><tr><th>Apelido</th><th>Placa</th><th>Modelo</th></tr></thead><tbody>
      {(vehicles.data||[]).map((v:{id:string;nickname:string;plate:string|null;make:string|null;model:string|null})=><tr key={v.id}>
        <td>{v.nickname}</td><td>{v.plate||"—"}</td><td>{[v.make,v.model].filter(Boolean).join(" ")}</td>
      </tr>)}
      {!vehicles.data?.length&&<tr><td colSpan={3}>Sem veículo cadastrado.</td></tr>}
    </tbody></table></div>
  </>;
}
