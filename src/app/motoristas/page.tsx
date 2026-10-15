import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {Header,SectionTitle} from "@/components/ui";
import {registerPrimeDriver} from "./actions";
export default async function MotoristasPage(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect("/login");
 const {data:ws}=await supabase.from("workspaces").select("id")
  .eq("owner_id",user.id).eq("kind","prime").maybeSingle();
 const {data:drivers,error}=ws?await supabase.from("drivers")
  .select("id,name,document,phone,license_number,license_expires_on,active")
  .eq("workspace_id",ws.id).order("name"):
  {data:[],error:null};
 return <>
  <Header title="Motoristas da Prime" subtitle="Cadastro da equipe vinculado ao ambiente da transportadora."/>
  <div className="quick">
   <Link href="/fiscal">CT-e e MDF-e</Link>
   <Link href="/frota">Veículos cadastrados</Link>
   <a target="_blank" rel="noopener noreferrer" href="https://consultapublica.antt.gov.br/Site/ConsultaRNTRC.aspx">
    ANTT — consulta RNTRC
   </a>
  </div>
  <form action={registerPrimeDriver} className="card" style={{display:"grid",gap:12,maxWidth:760,marginTop:20}}>
   <h3>Cadastrar motorista</h3>
   <label>Nome completo <input name="name" required minLength={3}/></label>
   <label>CPF <input name="document" required inputMode="numeric" maxLength={14}/></label>
   <label>Telefone <input name="phone" inputMode="tel"/></label>
   <label>CNH (número) <input name="license_number" inputMode="numeric"/></label>
   <label>Validade da CNH <input name="license_expires_on" type="date"/></label>
   <button className="button">Cadastrar motorista</button>
  </form>
  <SectionTitle title="Equipe cadastrada"/>
  {error&&<div className="notice">Falha ao consultar motoristas.</div>}
  <div className="table-wrap"><table><thead><tr>
   <th>Nome</th><th>CPF</th><th>Telefone</th><th>Validade CNH</th><th>Status</th>
  </tr></thead><tbody>
   {(drivers??[]).map(driver=><tr key={driver.id}>
    <td>{driver.name}</td>
    <td>{driver.document?"***.***.***-"+driver.document.slice(-2):"Não informado"}</td>
    <td>{driver.phone||"—"}</td>
    <td>{driver.license_expires_on||"Não informada"}</td>
    <td>{driver.active?"Ativo":"Inativo"}</td>
   </tr>)}
   {!drivers?.length&&<tr><td colSpan={5}>Nenhum motorista cadastrado.</td></tr>}
  </tbody></table></div>
 </>;
}
