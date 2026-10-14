import { sendScheduledWhatsAppMessage } from "@/lib/whatsapp/worker";

type ReminderJob={
  id:string;phone:string;description:string;amount:number;dueDate:string;
  stage:"before3"|"today";kind:string;workspace:string;
};
const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);
const dt=(value:string)=>new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T12:00:00Z"));
async function rpc<T>(name:string,payload:Record<string,unknown>):Promise<T>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error("Supabase bridge not configured");
  const response=await fetch(url+"/rest/v1/rpc/"+name,{
    method:"POST",cache:"no-store",signal:AbortSignal.timeout(15000),
    headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify(payload),
  });
  if(!response.ok)throw new Error("Reminder RPC "+name+" HTTP "+response.status);
  return response.json() as Promise<T>;
}
function messageFor(items:ReminderJob[]){
  const lines=items.map(item=>{
    const category=item.kind==="payable"?"A pagar":item.kind==="receivable"?"A receber":
      item.kind==="loan_installment"?"Parcela":item.kind==="loan_due"?"Empréstimo":"Lembrete";
    const environment=item.workspace==="prime"?"Prime Group":item.workspace==="personal"?"Pessoal":"Juros";
    const when=item.stage==="today"?"Vence hoje":"Vence em 3 dias";
    return "• "+when+" ("+dt(item.dueDate)+") · "+category+" · "+environment+"\n"
      +item.description+" · "+brl(Number(item.amount));
  });
  return "Prime Finance — avisos de vencimento\n\n"
    +lines.join("\n\n")
    +"\n\nConsulte o app para conferir. Este aviso não representa pagamento ou baixa.";
}
export async function runScheduledReminders(){
  if(process.env.WHATSAPP_PROVIDER!=="evolution_go")return {queued:0,sent:0,disabled:true};
  const secret=process.env.WHATSAPP_INGRESS_SECRET||"";
  if(secret.length<24)throw new Error("WhatsApp reminder secret missing");
  const jobs=await rpc<ReminderJob[]>("prime_claim_reminder_notifications",{
    p_secret:secret,p_limit:18,
  });
  const groups=new Map<string,ReminderJob[]>();
  for(const job of jobs){
    if(!/^[0-9]{10,15}$/.test(job.phone))continue;
    groups.set(job.phone,[...(groups.get(job.phone)||[]),job]);
  }
  let sent=0,failed=0;
  for(const [phone,items] of groups){
    const batches:ReminderJob[][]=[];
    for(const item of items){
      const last=batches.at(-1);
      if(!last||messageFor([...last,item]).length>3700)batches.push([item]);
      else last.push(item);
    }
    for(const batch of batches){
      try{
        // Group each recipient's due items, but never truncate a notification.
        await sendScheduledWhatsAppMessage(phone,messageFor(batch));
        for(const job of batch){
          await rpc("prime_finish_reminder_notification",{
            p_secret:secret,p_id:job.id,p_success:true,
          });
          sent++;
        }
      }catch(e){
        const error=e instanceof Error?e.message:"Unknown delivery failure";
        for(const job of batch){
          await rpc("prime_finish_reminder_notification",{
            p_secret:secret,p_id:job.id,p_success:false,p_error:error,
          }).catch(()=>undefined);
          failed++;
        }
      }
    }
  }
  return {queued:jobs.length,sent,failed};
}
