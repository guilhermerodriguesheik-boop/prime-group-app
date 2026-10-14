import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import Link from "next/link";
import {Header,SectionTitle,Metric} from "@/components/ui";
import {brl,shortDate} from "@/lib/finance/format";
import {saveCrewAssignment,removeCrewAssignment} from "@/app/actions/premium";
type Trip={id:string;service_date:string|null;origin:string|null;destination:string|null;customer_name:string|null;reference:string|null;status:string};
type Worker={id:string;name:string;phone:string|null;whatsapp_consent:boolean;kind:string};
type Assignment={id:string;trip_id:string;worker_id:string;role:"driver"|"helper";amount:number;notes:string|null};
const weekday=(date:Date)=>date.toISOString().slice(0,10);
function Edit({row,trips,workers}:{row?:Assignment;trips:Trip[];workers:Worker[]}){
 return <form action={saveCrewAssignment} className="premium-form">
  {row&&<input type="hidden" name="id" value={row.id}/>}
  <label>Frete<select name="trip_id" required defaultValue={row?.trip_id||trips[0]?.id||""}>{trips.map(t=><option key={t.id} value={t.id}>{t.service_date||"Sem data"} · {t.origin||"Origem"} → {t.destination||"Destino"} ({t.reference||t.customer_name||"Frete"})</option>)}</select></label>
  <label>Motorista / ajudante<select name="worker_id" required defaultValue={row?.worker_id||workers[0]?.id||""}>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
  <label>Função<select name="role" defaultValue={row?.role||"driver"}><option value="driver">Motorista</option><option value="helper">Ajudante</option></select></label>
  <label>Valor combinado (R$)<input name="amount" type="number" min="0" step=".01" required defaultValue={row?.amount||0}/></label>
  <label>Observações<input name="notes" maxLength={160} defaultValue={row?.notes||""}/></label>
  <button className="button primary" type="submit">Salvar prestação</button>
 </form>;
}
export default async function Page(){
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user}}=await db.auth.getUser();if(!user)throw Error("Faça login.");
 const {data:w}=await db.from("workspaces").select("id").eq("owner_id",user.id).eq("kind","prime").limit(1).single();
 if(!w)throw Error("Ambiente Prime indisponível.");
 const [tripsQuery,peopleQuery,assQuery]=await Promise.all([
  db.from("trips").select("id,service_date,origin,destination,customer_name,reference,status").eq("workspace_id",w.id).order("service_date",{ascending:false}).limit(200),
  db.from("counterparties").select("id,name,phone,whatsapp_consent,kind").eq("workspace_id",w.id).order("name"),
  db.from("prime_trip_workers").select("id,trip_id,worker_id,role,amount,notes").order("created_at",{ascending:false}).limit(500),
 ]);
 if(tripsQuery.error||peopleQuery.error||assQuery.error)throw Error("Não foi possível consultar a equipe.");
 const trips=(tripsQuery.data||[]) as Trip[],people=(peopleQuery.data||[]) as Worker[];
 const tripMap=new Map(trips.map(t=>[t.id,t]));
 const workers=new Map(people.map(p=>[p.id,p]));
 const rows=((assQuery.data||[]) as Assignment[]).filter(a=>tripMap.has(a.trip_id));
 const localNow=new Date(new Date().toLocaleString("en-US",{timeZone:"America/Sao_Paulo"}));
 const day=localNow.getDay(),diff=(day+6)%7;const start=new Date(localNow);start.setDate(localNow.getDate()-diff);
 const end=new Date(start);end.setDate(start.getDate()+4);
 const first=weekday(start),last=weekday(end);
 const week=rows.filter(a=>{const t=tripMap.get(a.trip_id);return t?.service_date && t.service_date>=first && t.service_date<=last && t.status==="completed";});
 const sums=new Map<string,Assignment[]>();for(const x of week)sums.set(x.worker_id,[...(sums.get(x.worker_id)||[]),x]);
 const weeklyTotal=week.reduce((s,r)=>s+Number(r.amount),0);
 return <><Header title="Equipe e fechamento de sexta" subtitle="Controle de motoristas e ajudantes por frete, com demonstrativo pronto para enviar."/>
 <div className="record-toolbar"><Link className="button" href="/prime">Financeiro Prime</Link><Link className="button" href="/viagens">Cadastrar frete</Link><Link className="button" href="/prime">Cadastrar profissional</Link></div>
 <div className="grid grid-3"><Metric label="Valores combinados na semana" value={brl(weeklyTotal)}/><Metric label="Fretes com equipe registrados" value={String(new Set(week.map(x=>x.trip_id)).size)}/><Metric label="Profissionais no fechamento" value={String(sums.size)}/></div>
 <div className="notice">Fechamento de {shortDate(first)} a {shortDate(last)}. Só entram fretes marcados como concluídos e com profissional cadastrado. O demonstrativo não comprova pagamento: revise e confirme antes de enviar pelo seu WhatsApp.</div>
 <details className="premium-disclosure"><summary>+ Registrar motorista ou ajudante em um frete</summary>
  {trips.length&&people.length?<Edit trips={trips} workers={people}/>:<p className="metric-foot">Cadastre antes um frete e uma pessoa na Prime Group.</p>}
 </details>
 <SectionTitle title="Resumo por profissional" hint="Mensagens geradas para revisão e envio manual"/>
 <div className="premium-recurring-grid">{[...sums.entries()].map(([id,items])=>{
  const person=workers.get(id);if(!person)return null;
  const total=items.reduce((sum,a)=>sum+Number(a.amount),0);
  const lines=items.map(a=>{const t=tripMap.get(a.trip_id);return "• "+shortDate(t?.service_date||"")+" · "+(t?.origin||"Origem")+" → "+(t?.destination||"Destino")+" · "+(a.role==="driver"?"Motorista":"Ajudante")+" · "+brl(Number(a.amount));});
  const message="Prime Group · Fechamento semanal\n"+person.name+"\n"+shortDate(first)+" a "+shortDate(last)+"\n\n"+lines.join("\n")+"\n\nTotal combinado: "+brl(total)+"\nConferir antes de considerar como pago.";
  const digits=(person.phone||"").replace(/\D/g,"");
  const phone=digits.length===10||digits.length===11?"55"+digits:digits;
  const valid=/^[0-9]{12,15}$/.test(phone);
  return <article key={id} className="card premium-obligation"><div className="premium-obligation-head"><strong>{person.name}</strong><span className="bank-inline-badge good">{items.length} fretes</span></div>
   <div className="premium-obligation-value">{brl(total)}</div><div className="metric-foot">Relatório de fretes e dias: {items.length} serviços concluídos nesta semana.</div>
   <div className="premium-mini-list">{lines.map(l=><div key={l}>{l}</div>)}</div>
   {valid&&person.whatsapp_consent?<a className="button primary" href={"https://wa.me/"+phone+"?text="+encodeURIComponent(message)}
     target="_blank" rel="noreferrer">Revisar e enviar pelo WhatsApp</a>:<div className="notice">Cadastre o WhatsApp do profissional e confirme a autorização para receber mensagens antes de enviar.</div>}
  </article>;
 })}{!sums.size&&<div className="bank-empty">Nenhum fechamento nesta semana. Cadastre os profissionais e marque os fretes concluídos.</div>}</div>
 <SectionTitle title="Equipe cadastrada por frete" hint="Edite ou exclua lançamentos incorretos antes do pagamento"/>
 <div className="table-wrap"><table><thead><tr><th>Frete</th><th>Profissional</th><th>Função</th><th>Valor</th><th>Ações</th></tr></thead><tbody>
 {rows.map(a=><tr key={a.id}><td>{tripMap.get(a.trip_id)?.reference||tripMap.get(a.trip_id)?.origin||"Frete"}</td><td>{workers.get(a.worker_id)?.name||"Profissional"}</td><td>{a.role==="driver"?"Motorista":"Ajudante"}</td><td>{brl(Number(a.amount))}</td><td><details className="premium-disclosure"><summary>Editar</summary><Edit row={a} trips={trips} workers={people}/></details><form action={removeCrewAssignment}><input type="hidden" name="id" value={a.id}/><input type="hidden" name="confirm" value="EXCLUIR"/><button type="submit" className="button compact record-danger">Excluir</button></form></td></tr>)}
 </tbody></table></div>
 </>;
}
