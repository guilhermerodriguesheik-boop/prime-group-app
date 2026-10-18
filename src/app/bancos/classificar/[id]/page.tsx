import {redirect} from "next/navigation";
import {primeRpc} from "@/lib/whatsapp/prime-automations";
import {verifyBankAction} from "@/lib/banks/whatsapp-action-link";

type Card={ok:boolean;amount?:number;direction?:string;description?:string;
 occurredOn?:string;account?:string;destination?:string;pendingBank?:boolean};
const choices=[
 {code:"prime",label:"Empresa"},
 {code:"personal",label:"Pessoal"},
 {code:"interest",label:"Empréstimos"},
 {code:"transfer",label:"Transferência"},
 {code:"pending",label:"Deixar pendente"}
] as const;
const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const dynamic="force-dynamic";

export default async function BankActionPage({
 params,searchParams
}:{
 params:Promise<{id:string}>;
 searchParams:Promise<{expires?:string;sig?:string;saved?:string;error?:string}>;
}){
 const {id}=await params;
 const query=await searchParams;
 const expiry=query.expires||"";
 const signature=query.sig||"";
 const authorized=validId.test(id)&&verifyBankAction(
  id,expiry,signature,process.env.WHATSAPP_INGRESS_SECRET||""
 );
 let card:Card={ok:false};
 if(authorized){
  try{card=await primeRpc<Card>("prime_get_bank_action_card",{p_outbox_id:id});}
  catch{card={ok:false};}
 }
 const available=authorized&&card.ok;
 async function choose(form:FormData){
  "use server";
  const destination=form.get("destination");
  if(typeof destination!=="string" || !choices.some(x=>x.code===destination)
   || !verifyBankAction(id,expiry,signature,process.env.WHATSAPP_INGRESS_SECRET||""))
   redirect("/bancos/classificar/"+id+"?error=expired");
  let saved=false;
  try{saved=await primeRpc<boolean>("prime_choose_bank_action_area",{
   p_outbox_id:id,p_destination:destination
  });}catch{/* Never claim success on failure. */}
  const url=new URLSearchParams({expires:expiry,sig:signature});
  url.set(saved?"saved":"error",saved?destination:"unavailable");
  redirect("/bancos/classificar/"+id+"?"+url.toString());
 }
 const amount=Number(card.amount||0).toLocaleString("pt-BR",{
  style:"currency",currency:"BRL"});
 const chosen=choices.find(x=>x.code===card.destination)?.label||"Sem classificação";
 return <div style={{margin:"12px auto",maxWidth:540,padding:20}}>
  <section style={{padding:22,background:"var(--card,#fff)",border:"1px solid #b7c8d2",borderRadius:18}}>
   <p style={{fontSize:12,letterSpacing:1.2,color:"#567",fontWeight:700}}>PRIME FINANCE · CLASSIFICAÇÃO</p>
   <h1 style={{fontSize:24,marginBottom:12}}>Classificar movimentação</h1>
   {!available?
    <p>Este link expirou ou a movimentação não está disponível. Solicite um novo relatório no WhatsApp.</p>
   :<>
    <p style={{fontSize:31,fontWeight:800,margin:"10px 0"}}>
     {card.direction==="credit"?"Entrada":"Saída"} · {amount}
    </p>
    <p style={{overflowWrap:"anywhere"}}>{card.description}</p>
    <p style={{fontSize:13,color:"#667"}}>{card.account} · {card.occurredOn}
     {card.pendingBank?" · Pendente no banco":""}</p>
    <p style={{fontSize:14}}>Área atual: <strong>{chosen}</strong></p>
    {query.saved&&query.saved===card.destination&&choices.some(x=>x.code===query.saved)&&
     <p role="status" style={{padding:12,background:"#def6e6",color:"#17512e",borderRadius:10}}>
      Classificação salva: {choices.find(x=>x.code===query.saved)?.label}.
     </p>}
    {query.error&&<p role="alert">Não foi possível salvar. O link pode ter expirado.</p>}
    <form action={choose} style={{display:"grid",gap:10,marginTop:18}}>
     {choices.map(x=><button type="submit" name="destination" value={x.code} key={x.code}
      style={{padding:"15px 14px",border:"1px solid #94aaba",borderRadius:12,
       background:x.code===card.destination?"#dcefe9":"#f3f7fa",
       color:"#152e40",fontSize:17,fontWeight:700,cursor:"pointer",textAlign:"left"}}>
      {x.label}{x.code===card.destination?" ✓":""}
     </button>)}
    </form>
    <p style={{fontSize:12,color:"#64748b",marginTop:18}}>
     Esta ação apenas classifica o extrato. Não transfere dinheiro, não cria despesas e não efetua baixas.
    </p>
   </>}
  </section>
 </div>;
}
