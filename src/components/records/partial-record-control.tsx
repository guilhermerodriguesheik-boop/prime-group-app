"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { archivePartialRecord,savePartialRecord } from "@/app/registros/actions";
type Item={id:string;subject:string;original_text:string;workspace_id:string|null};
type Work={id:string;name:string};
export function PartialRecordControl({record,workspaces}:{record?:Item;workspaces:Work[]}){
 const router=useRouter(),[open,setOpen]=useState(false),[removing,setRemoving]=useState(false),
 [busy,setBusy]=useState(false),[error,setError]=useState(""),[confirm,setConfirm]=useState("");
 function close(){if(!busy){setOpen(false);setRemoving(false);setError("");setConfirm("");}}
 async function save(event:React.FormEvent<HTMLFormElement>){
   event.preventDefault();setBusy(true);setError("");
   try{const data=new FormData(event.currentTarget);if(record)data.set("record_id",record.id);
     await savePartialRecord(data);close();setOpen(false);router.refresh();
   }catch(e){setError(e instanceof Error?e.message:"Falha ao salvar.");}
   finally{setBusy(false);}
 }
 async function remove(){
   if(!record||confirm!=="EXCLUIR")return;
   setBusy(true);
   try{const data=new FormData();data.set("record_id",record.id);data.set("confirm",confirm);
     await archivePartialRecord(data);setRemoving(false);router.refresh();
   }catch(e){setError(e instanceof Error?e.message:"Falha ao excluir.");}
   finally{setBusy(false);}
 }
 return <><span className="record-actions">
  <button className={"button compact record-trigger "+(!record?"primary":"")} type="button" onClick={()=>{setError("");setOpen(true)}}>
   {record?<Pencil size={14}/>:<Plus size={15}/>} {record?"Editar":"Nova anotação"}
  </button>
  {record&&<button className="button compact record-danger" type="button" onClick={()=>{setError("");setRemoving(true)}}><Trash2 size={14}/> Excluir</button>}
 </span>
 {(open||removing)&&<div className="record-modal-backdrop"><div className="record-modal" role="dialog" aria-modal="true" aria-label={removing?"Excluir anotação":"Editar anotação"}>
  <div className="record-modal-head"><h3>{removing?"Arquivar anotação":record?"Editar anotação":"Nova anotação"}</h3><button type="button" className="button compact" onClick={close}><X size={16}/></button></div>
  {removing?<><p className="metric-foot">A anotação sairá da lista, mas seu histórico ficará arquivado.</p><label className="record-field">Digite EXCLUIR para confirmar<input value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{error&&<p className="record-error">{error}</p>}<div className="record-modal-foot"><button type="button" className="button" onClick={close}>Cancelar</button><button type="button" className="button record-danger" disabled={busy||confirm!=="EXCLUIR"} onClick={()=>void remove()}>Arquivar</button></div></>:
  <form className="record-form" onSubmit={e=>void save(e)}>
    <label className="record-field">Assunto<input name="subject" required maxLength={200} defaultValue={record?.subject||""}/></label>
    <label className="record-field">Ambiente<select name="workspace_id" defaultValue={record?.workspace_id||""}>
      <option value="">A classificar</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
    <label className="record-field">Conteúdo<textarea name="original_text" required rows={5} defaultValue={record?.original_text||""}/></label>
    {error&&<p className="record-error">{error}</p>}
    <div className="record-modal-foot"><button className="button" type="button" onClick={close}>Cancelar</button><button className="button primary" disabled={busy} type="submit">{busy?"Salvando...":"Salvar"}</button></div>
  </form>}
 </div></div>}
 </>;
}
