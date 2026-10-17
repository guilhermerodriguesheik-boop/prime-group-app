"use client";
import {useState} from "react";
import {classifyBankMovement} from "@/app/actions/premium";

export type BankArea="prime"|"personal"|"interest"|"transfer"|"pending";
export const bankAreaLabels:Record<BankArea,string>={
 prime:"Empresa",personal:"Pessoal",interest:"Empréstimo",
 transfer:"Transferência",pending:"Não classificado"
};
function allowed(v:string|null|undefined):BankArea{
 return v==="prime"||v==="personal"||v==="interest"||v==="transfer"?v:"pending";
}
export function BankMovementDestination({id,destination,category,onSaved}:{
 id:string;destination?:string|null;category?:string|null;onSaved?:()=>void|Promise<void>
}){
 const [value,setValue]=useState<BankArea>(allowed(destination));
 const [saving,setSaving]=useState(false);
 const [feedback,setFeedback]=useState("");
 async function change(next:BankArea){
  if(saving||next===value)return;
  const prev=value;
  setValue(next);setSaving(true);setFeedback("");
  try{
   const form=new FormData();
   form.set("id",id);
   form.set("destination",next);
   form.set("category",category||"");
   await classifyBankMovement(form);
   setFeedback("Salvo");
   await onSaved?.();
  }catch(e){
   setValue(prev);
   setFeedback(e instanceof Error?e.message:"Não foi possível salvar a área");
  }finally{setSaving(false);}
 }
 return <div style={{minWidth:140}}>
  <select aria-label="Área financeira deste lançamento" className="bank-select"
   value={value} disabled={saving}
   onChange={e=>void change(e.target.value as BankArea)}>
   <option value="pending">Selecionar área</option>
   <option value="prime">Empresa</option>
   <option value="personal">Pessoal</option>
   <option value="interest">Empréstimo</option>
   <option value="transfer">Transferência</option>
  </select>
  {saving?<small style={{display:"block",marginTop:3}}>Salvando...</small>:
   feedback&&<small role="status" style={{display:"block",marginTop:3}}>
    {feedback}
   </small>}
 </div>;
}
