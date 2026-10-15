"use client";
import {useState} from "react";
export function FiscalAiPanel(){
 const [question,setQuestion]=useState("");
 const [answer,setAnswer]=useState("");
 const [busy,setBusy]=useState(false);
 async function ask(){
  if(question.trim().length<3||busy)return;
  setBusy(true);setAnswer("");
  try{
   const response=await fetch("/api/fiscal/ai",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({question}),
   });
   const data=await response.json() as {answer?:string;error?:string};
   setAnswer(data.answer||data.error||"Não foi possível responder.");
  }catch{setAnswer("Falha na consulta de IA.");}
  finally{setBusy(false);}
 }
 return <section className="card" style={{display:"grid",gap:12,maxWidth:760}}>
  <h3>Assistente IA para fretes, NF-e, CT-e e MDF-e</h3>
  <p>Consulte cargas importadas, valores de frete, notas fiscais, motoristas e veículos cadastrados.</p>
  <label>Sua pergunta
   <textarea value={question} onChange={e=>setQuestion(e.target.value)} rows={3} maxLength={1500}
    placeholder="Quais cargas da Ortobom estão aguardando CT-e?"/>
  </label>
  <button type="button" onClick={ask} disabled={busy||question.trim().length<3} className="button">
   {busy?"Consultando...":"Perguntar para IA"}
  </button>
  {answer&&<div role="status" className="notice" style={{whiteSpace:"pre-wrap"}}>{answer}</div>}
 </section>;
}
