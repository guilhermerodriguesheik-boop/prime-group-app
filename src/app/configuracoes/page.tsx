import Link from "next/link";
import {Header,SectionTitle} from "@/components/ui";
import {createClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {savePremiumNotifications} from "@/app/actions/premium";
import {ActivateBankEvents} from "@/components/premium/activate-bank-events";
export default async function Page(){
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user}}=await db.auth.getUser();if(!user)throw Error("Faça login.");
 const [prefs,phone,alertCount]=await Promise.all([
  db.from("prime_notification_settings").select("bank_alerts,weekly_reports,monthly_reports").eq("user_id",user.id).maybeSingle(),
  db.from("whatsapp_pairings").select("phone_number,enabled,connected_at").eq("user_id",user.id).maybeSingle(),
  db.from("prime_outbox").select("id",{count:"exact",head:true}).eq("user_id",user.id).eq("status","failed"),
 ]);
 if(prefs.error||phone.error)throw Error("Não foi possível consultar a configuração.");
 const values=prefs.data||{bank_alerts:false,weekly_reports:false,monthly_reports:false};
 const active=phone.data?.enabled&&phone.data.connected_at;
 return <><Header title="Automação e WhatsApp" subtitle="Controle de notificações, relatórios financeiros e eventos bancários."/>
 <div className="premium-settings-grid">
  <section className="card"><div className="premium-eyebrow">CANAL AUTORIZADO</div><h3>WhatsApp Evolution Go</h3>
   <div className="premium-obligation-value" style={{fontSize:23}}>{active?"Conectado":"Não conectado"}</div>
   <p className="metric-foot">{active?"Suas mensagens financeiras serão enviadas ao número vinculado.":"Vincule seu WhatsApp antes de ativar os avisos."}</p>
   <Link className="button" href="/integracoes">Gerenciar integração</Link>
  </section>
  <section className="card"><div className="premium-eyebrow">OPERAÇÃO BANCÁRIA</div><h3>Notificações de movimentações</h3>
    <p className="metric-foot">A Pluggy notifica quando identifica uma movimentação nova, não obrigatoriamente no instante do Pix.</p>
    <ActivateBankEvents/>
  </section>
 </div>
 <SectionTitle title="Preferências dos seus avisos"/>
 <form action={savePremiumNotifications} className="card premium-notifications-form">
  <label className="premium-toggle"><span><strong>Avisos de novos Pix e transações</strong><small>Enviar movimentações para seu WhatsApp e perguntar como classificar no Prime Finance.</small></span><input type="checkbox" name="bank_alerts" defaultChecked={!!values.bank_alerts}/></label>
  <label className="premium-toggle"><span><strong>Relatórios semanais aos sábados</strong><small>Um relatório da Prime e outro Pessoal com receitas, despesas, resultado e pendências.</small></span><input type="checkbox" name="weekly_reports" defaultChecked={!!values.weekly_reports}/></label>
  <label className="premium-toggle"><span><strong>Relatórios mensais no último dia</strong><small>Resumo do mês com posição até a hora do envio e distinção entre valores lançados e não conciliados.</small></span><input type="checkbox" name="monthly_reports" defaultChecked={!!values.monthly_reports}/></label>
  <p className="metric-foot">Lembretes de vencimento e cobranças para terceiros possuem controles próprios. Apenas contatos autorizados recebem cobrança automática no vencimento. Mensagens da equipe são preparadas para revisão manual.</p>
  <button type="submit" className="button primary" style={{width:"fit-content"}}>Salvar preferências</button>
 </form>
 {(alertCount.count||0)>0&&<div className="notice">Há {alertCount.count} avisos com falha registrada. Verifique a integração antes de depender apenas dessas mensagens.</div>}
 <div className="record-toolbar"><Link className="button" href="/recorrentes">Dívidas recorrentes</Link><Link className="button" href="/equipes">Motoristas e ajudantes</Link><Link className="button" href="/relatorios">Gráficos e relatórios</Link></div>
 </>;
}
