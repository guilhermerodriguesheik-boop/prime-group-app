"use client";
import {useState} from "react";
import {RadioTower} from "lucide-react";
export function ActivateBankEvents(){
 const [working,setWorking]=useState(false),[message,setMessage]=useState("");
 async function activate(){
  setWorking(true);setMessage("");
  try{
   const res=await fetch("/api/banks/webhooks/setup",{method:"POST",headers:{"Content-Type":"application/json"}});
   const body=await res.json();
   if(!res.ok)throw Error(body.error||"A configuração não foi concluída.");
   setMessage("Avisos de novas transações cadastrados na Pluggy. O disparo depende da atualização dos dados pelo banco.");
  }catch(err){setMessage(err instanceof Error?err.message:"Configuração indisponível.");}
  finally{setWorking(false);}
 }
 return <div className="premium-setting-action">
  <button type="button" className="button primary" disabled={working} onClick={()=>void activate()}><RadioTower size={15} style={{display:"inline",verticalAlign:"middle",marginRight:6}}/>{working?"Configurando...":"Ativar eventos da Pluggy"}</button>
  {message&&<div className="metric-foot" role="status">{message}</div>}
 </div>;
}
