import {redirect} from "next/navigation";
import type {SupabaseClient} from "@supabase/supabase-js";
import {Header} from "@/components/ui";
import {createClient} from "@/lib/supabase/server";
import {DeliveryBoard,type DeliveryOrder} from "@/components/deliveries/delivery-board";
export const dynamic="force-dynamic";
export default async function DeliveriesPage(){
 const db=await createClient() as unknown as SupabaseClient;
 const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const {data:w}=await db.from("workspaces").select("id").eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 if(!w)return <><Header title="Entregas por volume" subtitle="Prime Group"/><div className="notice attention">Ambiente Prime não encontrado.</div></>;
 const {data,error}=await db.from("prime_delivery_orders").select("*").eq("workspace_id",w.id).order("created_at",{ascending:false}).limit(2500);
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 return <><Header title="Entregas por volume" subtitle="Importação por foto, conferência, baixa e faturamento semanal por contratante."/>
  <DeliveryBoard initialOrders={(data||[]) as DeliveryOrder[]} today={today}
   loadError={error?"Banco de entregas ainda não foi ativado. Aplique a migração SQL deste módulo.":null}/>
 </>;
}
