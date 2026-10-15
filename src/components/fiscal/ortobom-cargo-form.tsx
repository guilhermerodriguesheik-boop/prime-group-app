"use client";
import {useActionState} from "react";
import {importOrtobomCargo,type CargoImportState} from "@/app/fiscal/ortobom-actions";
const initial:CargoImportState={ok:false,message:""};
export function OrtobomCargoForm(){
 const [state,action,pending]=useActionState(importOrtobomCargo,initial);
 return <form action={action} className="card" style={{display:"grid",gap:12,maxWidth:740}}>
  <h3>Importar carga por email</h3>
  <p>Cole o assunto e o corpo da mensagem da Ortobom. Selecione todos os XMLs da mesma carga.</p>
  <label>Assunto <input name="subject" required maxLength={200}/></label>
  <label>Conteudo do email <textarea name="body" required maxLength={12000} rows={5}/></label>
  <label>XMLs anexados <input name="xmls" type="file" required multiple accept=".xml,text/xml"/></label>
  <button className="button" disabled={pending}>{pending?"Importando...":"Importar carga"}</button>
  {state.message&&<p role="status">{state.message}</p>}
 </form>;
}
