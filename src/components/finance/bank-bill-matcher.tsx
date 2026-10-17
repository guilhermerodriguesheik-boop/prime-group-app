"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {BankMovementDestination} from "@/components/banks/bank-movement-destination";
import {bankMovementNature,reviewSuggestions,type ReviewCargo,type ReviewRecurring} from "@/lib/finance/bank-review-suggestions";
type BankMovement={id:string;workspace_id:string;bank_account_id:string;occurred_on:string;
 description:string;amount:number|string;direction:"credit"|"debit";review_status:string};
type Bill={id:string;workspace_id:string;description:string;amount:number|string;
 settled:number|string;status:string;due_date:string;kind:"payable"|"receivable"};
type Matched={bank_transaction_id:string;workspace_id:string;bill_kind:string;
 bill_id:string;amount:number|string;created_at:string};
const brl=(n:number|string)=>Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function BankBillMatcher({movements,bills,matches,accountNames,recurring,cargos,classifications}:{
 movements:BankMovement[];bills:Bill[];matches:Matched[];accountNames:Record<string,string>;
 recurring:ReviewRecurring[];cargos:ReviewCargo[];
 classifications:Array<{bank_transaction_id:string;destination:string;category:string|null}>}){
 const router=useRouter();
 const [chosen,setChosen]=useState<Record<string,string>>({});
 const mapped=new Map(classifications.map(c=>[c.bank_transaction_id,c]));
 const [busy,setBusy]=useState(""),[error,setError]=useState("");
 const [success,setSuccess]=useState("");
 async function submit(action:"confirm"|"undo",bankTransactionId:string,billId?:string,kind?:"payable"|"receivable"){
  if(!window.confirm(action==="confirm"?
   "Vincular este movimento bancário à conta escolhida e registrar a baixa?":
   "Desfazer o vínculo bancário e reabrir o valor correspondente da conta?"))return;
  setBusy(bankTransactionId);setError("");setSuccess("");
  try{
   const response=await fetch("/api/financeiro/conciliar",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,bankTransactionId,billId,kind})
   });
   const result=await response.json() as {error?:string};
   if(!response.ok)throw Error(result.error||"Não foi possível conciliar.");
   setSuccess(action==="confirm"?"Pagamento conciliado com a conta.":"Conciliação desfeita.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Falha na conciliação.");}
  finally{setBusy("");}
 }
 return <section style={{marginTop:18}}>
  <h3 style={{marginBottom:6}}>Conciliar extrato e contas cadastradas</h3>
  <p className="metric-foot">
   Os possíveis cruzamentos são apenas avisos para conferência: nenhuma conta é quitada
   ou classificada sem você confirmar. <Link href="/bancos">Classifique outras movimentações em Bancos</Link>.
  </p>
  <p className="metric-foot">
   Escolha uma movimentação e a obrigação correspondente. Somente lançamentos confirmados pelo banco,
   no mesmo ambiente e com valor até o saldo pendente, podem dar baixa. Uma movimentação só pode ser usada uma vez.
  </p>
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  {success&&<p role="status" style={{color:"#166534"}}>{success}</p>}
  <div className="table-wrap"><table><thead><tr>
   <th>Data</th><th>Banco</th><th>Movimento</th><th>Valor</th><th>Área financeira</th><th>Vincular conta</th><th></th>
  </tr></thead><tbody>
  {movements.map(t=>{
   const kind=t.direction==="debit"?"payable":"receivable";
   const eligible=bankMovementNature(t).transfer?[]:bills.filter(b=>b.kind===kind&&b.workspace_id===t.workspace_id
     &&Number(b.amount)-Number(b.settled)>=Number(t.amount)-.005
     &&!["paid","received","cancelled"].includes(b.status));
   const selected=eligible.find(b=>b.id===chosen[t.id]);
   const hints=reviewSuggestions(t,bills,recurring,cargos);
   return <tr key={t.id}>
    <td>{t.occurred_on}</td>
    <td>{accountNames[t.bank_account_id]||"Banco"}</td>
    <td style={{maxWidth:250,overflowWrap:"anywhere"}}>{t.description}
     {hints.map((hint,i)=><small key={i} style={{display:"block",marginTop:4,
      color:"var(--warning-text,#92400e)"}}>{hint} · conferir antes de baixar</small>)}
    </td>
    <td><strong>{t.direction==="debit"?"− ":"+ "}{brl(t.amount)}</strong></td>
    <td><BankMovementDestination key={t.id+":"+(mapped.get(t.id)?.destination||"pending")}
     id={t.id} destination={mapped.get(t.id)?.destination}
     category={mapped.get(t.id)?.category} onSaved={()=>router.refresh()}/></td>
    <td><select value={chosen[t.id]||""} onChange={e=>setChosen(old=>({...old,[t.id]:e.target.value}))}>
     <option value="">{eligible.length?"Selecionar conta...":"Cadastre a conta antes"}</option>
     {eligible.map(b=><option key={b.id} value={b.id}>{b.description.slice(0,45)} — restante {brl(Number(b.amount)-Number(b.settled))}</option>)}
    </select></td>
    <td><button type="button" className="button" disabled={!selected||!!busy}
     onClick={()=>selected&&void submit("confirm",t.id,selected.id,selected.kind)}>
     {busy===t.id?"Conciliando...":"Conciliar"}</button></td>
   </tr>;
  })}
  {!movements.length&&<tr><td colSpan={7}>Não há novos movimentos bancários confirmados aguardando conciliação.</td></tr>}
  </tbody></table></div>
  {matches.length>0&&<>
   <h4 style={{marginTop:20}}>Baixas bancárias já conciliadas</h4>
   <div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Conta vinculada</th><th>Valor</th><th>Data do vínculo</th><th></th></tr></thead>
    <tbody>{matches.map(m=>{
     const related=bills.find(b=>b.id===m.bill_id);
     return <tr key={m.bank_transaction_id}>
      <td>{m.bill_kind==="payable"?"Conta a pagar":"Conta a receber"}</td>
      <td>{related?.description||"Conta vinculada"}</td>
      <td>{brl(m.amount)}</td>
      <td>{new Date(m.created_at).toLocaleDateString("pt-BR")}</td>
      <td><button type="button" className="button" disabled={!!busy}
       onClick={()=>void submit("undo",m.bank_transaction_id)}>
       {busy===m.bank_transaction_id?"Aguarde...":"Desfazer"}
      </button></td>
     </tr>;
    })}</tbody></table></div>
   </>
  }
 </section>;
}
