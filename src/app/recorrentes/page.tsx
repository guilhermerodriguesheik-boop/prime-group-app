import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {saveRecurringBill,toggleRecurringBill} from "@/app/actions/premium";
import {Header,Metric,SectionTitle} from "@/components/ui";
import {brl,shortDate} from "@/lib/finance/format";

type Bill={id:string;workspace_id:string;description:string;amount:number;due_day:number;starts_on:string;ends_on:string|null;active:boolean;counterparty_id:string|null;frequency:"weekly"|"monthly"|"quarterly"|"yearly"};
type Contact={id:string;name:string;workspace_id:string};
function EditBill({bill,workspace,contacts}:{bill?:Bill;workspace:"prime"|"personal";contacts:Contact[]}){
 return <form action={saveRecurringBill} className="premium-form">
  <input type="hidden" name="workspace" value={workspace}/>
  {bill&&<input type="hidden" name="id" value={bill.id}/>}
  <label>Despesa recorrente<input name="description" required maxLength={180} placeholder="Aluguel, plano, prestação..." defaultValue={bill?.description}/></label>
  <label>Valor mensal (R$)<input type="number" name="amount" required min=".01" step=".01" defaultValue={bill?.amount}/></label>
  <label>Frequência<select name="frequency" defaultValue={bill?.frequency||"monthly"}>
    <option value="monthly">Todo mês</option><option value="weekly">Toda semana</option>
    <option value="quarterly">A cada 3 meses</option><option value="yearly">Todo ano</option>
  </select></label>
  <label>Dia de vencimento<input name="due_day" type="number" required min={1} max={31} defaultValue={bill?.due_day||10}/>
   <span className="metric-foot">Semanal: 1=segunda a 7=domingo. Demais: dia 1 a 31 do mês.</span></label>
  <label>Credor ou fornecedor<select name="counterparty_id" defaultValue={bill?.counterparty_id||""}>
   <option value="">Sem credor vinculado</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
  </select></label>
  <label>Começa em<input name="starts_on" type="date" required defaultValue={bill?.starts_on||new Date().toISOString().slice(0,10)}/></label>
  <label>Termina em (opcional)<input name="ends_on" type="date" defaultValue={bill?.ends_on||""}/></label>
  <button className="button primary" type="submit">{bill?"Salvar alterações":"Cadastrar compromisso"}</button>
 </form>;
}
const monthlyEquivalent=(r:Bill)=>Number(r.amount)*(r.frequency==="weekly"?52/12:r.frequency==="quarterly"?1/3:r.frequency==="yearly"?1/12:1);
const frequencyLabel=(f:Bill["frequency"])=>f==="weekly"?"semana":f==="quarterly"?"trimestre":f==="yearly"?"ano":"mês";
export default async function Page(){
 const supabase=await createClient() as unknown as SupabaseClient;
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error("Faça login.");
 const [workspaces,bills,creditors]=await Promise.all([
  supabase.from("workspaces").select("id,kind").eq("owner_id",user.id),
  supabase.from("prime_recurring_bills").select("*").order("due_day",{ascending:true}),
  supabase.from("counterparties").select("id,name,workspace_id").order("name"),
 ]);
 if(workspaces.error||bills.error||creditors.error)throw Error("Não foi possível carregar as dívidas.");
 const records=bills.data as Bill[]||[],wsMap=new Map((workspaces.data||[]).map(w=>[w.id,w.kind]));
 const people=(creditors.data||[]) as Contact[];
 return <><Header title="Despesas e dívidas recorrentes" subtitle="Controle separado da Prime Group e da vida pessoal. Cada vencimento gera uma conta a pagar, sem pagar automaticamente."/>
 <div className="record-toolbar"><Link className="button" href="/planejamento">Ver todos os vencimentos</Link><Link className="button" href="/juros">Empréstimos e juros</Link></div>
 <div className="grid grid-3">
  <Metric label="Compromissos ativos" value={String(records.filter(r=>r.active).length)}/>
  <Metric label="Base mensal estimada · Prime" value={brl(records.filter(r=>r.active&&wsMap.get(r.workspace_id)==="prime").reduce((s,r)=>s+monthlyEquivalent(r),0))}/>
  <Metric label="Base mensal estimada · Pessoal" value={brl(records.filter(r=>r.active&&wsMap.get(r.workspace_id)==="personal").reduce((s,r)=>s+Number(r.amount),0))}/>
 </div>
 <div className="notice">Cadastre contas fixas uma vez. O Prime Finance gera a obrigação na frequência informada para você conferir; não desconta do saldo, não faz Pix e não considera uma conta paga sem registro de quitação. Alterar a recorrência não altera automaticamente os meses já lançados.</div>
 {(["prime","personal"] as const).map(kind=>{
  const subset=records.filter(r=>wsMap.get(r.workspace_id)===kind),id=workspaces.data?.find(w=>w.kind===kind)?.id;
  return <section key={kind} className="premium-section">
   <SectionTitle title={kind==="prime"?"Prime Group · Despesas fixas":"Pessoal · Despesas fixas"} hint={subset.filter(r=>r.active).length+" ativas"}/>
   {id?<details className="premium-disclosure"><summary>+ Nova dívida ou despesa fixa</summary><EditBill workspace={kind} contacts={people.filter(p=>p.workspace_id===id)}/></details>:<div className="notice">Ambiente não disponível.</div>}
   <div className="premium-recurring-grid">
   {subset.map(r=><article className="card premium-obligation" key={r.id}>
    <div className="premium-obligation-head"><strong>{r.description}</strong><span className={"badge "+(r.active?"green":"orange")}>{r.active?"Ativa":"Pausada"}</span></div>
    <div className="premium-obligation-value">{brl(Number(r.amount))}<small>/{frequencyLabel(r.frequency)}</small></div>
    <div className="metric-foot">{r.frequency==="weekly"?"Dia da semana ":"Dia "}{r.due_day} · Início {shortDate(r.starts_on)} {r.ends_on?" · até "+shortDate(r.ends_on):""}</div>
    <div className="premium-row-actions">
     <details className="premium-disclosure"><summary>Editar</summary><EditBill bill={r} workspace={kind} contacts={people.filter(p=>p.workspace_id===id)}/></details>
     <form action={toggleRecurringBill}><input type="hidden" name="workspace" value={kind}/><input type="hidden" name="id" value={r.id}/>
       <input type="hidden" name="enabled" value={r.active?"no":"yes"}/><button className="button compact" type="submit">{r.active?"Desativar":"Reativar"}</button>
     </form>
    </div>
   </article>)}
   {!subset.length&&<div className="bank-empty">Nenhuma obrigação recorrente cadastrada.</div>}
   </div>
  </section>;
 })}
 </>;
}
