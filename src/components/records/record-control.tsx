"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil,Plus,Trash2,X } from "lucide-react";
import { removeLocalRecord,saveLocalRecord } from "@/app/actions/local-records";

export type RecordType="transaction"|"payable"|"receivable"|"account"|"card"|"vehicle"|"trip"|"counterparty"|"recurring"|"reminder"|"loan"|"document";
export type WorkspaceType="prime"|"personal"|"interest";
type Datum=Record<string,unknown>;
type Lookup={counterparties?:{id:string;name:string}[];accounts?:{id:string;name:string}[];cards?:{id:string;name:string}[];vehicles?:{id:string;nickname:string}[]};
type Props={
  category:RecordType;workspace:WorkspaceType;record?:Datum;
  lookups?:Lookup;label?:string;
};
type Field={key:string;label:string;type?:"date"|"number"|"select"|"textarea"|"checkbox";required?:boolean;options?:[string,string][]};
const f=(key:string,label:string,required=false,type?:Field["type"],options?:Field["options"]):Field=>({key,label,required,type,options});
const configs:Record<RecordType,{title:string;create:Field[];edit?:Field[]}>={
 transaction:{title:"lançamento",create:[
  f("description","Descrição",true),f("amount","Valor (R$)",true,"number"),
  f("entry_mode","Tipo",true,"select",[["expense","Despesa paga"],["income","Receita recebida"],["card_purchase","Compra no cartão"],["card_payment","Pagamento de fatura"]]),
  f("occurred_at","Data",true,"date"),f("account_id","Conta de saída/entrada",false,"select"),
  f("card_id","Cartão (para compras/faturas)",false,"select"),f("vehicle_id","Veículo",false,"select"),
 ],edit:[f("description","Descrição",true),f("amount","Valor (R$)",true,"number"),
  f("type","Tipo",true,"select",[["expense","Despesa"],["income","Receita"],["card_payment","Pagamento de fatura"]]),f("occurred_at","Data",true,"date")]},
 payable:{title:"conta a pagar",create:[f("description","Descrição / credor",true),f("amount","Valor (R$)",true,"number"),f("due_date","Vencimento",true,"date")]},
 receivable:{title:"conta a receber",create:[f("description","Descrição / devedor",true),f("amount","Valor (R$)",true,"number"),f("due_date","Vencimento",true,"date")]},
 account:{title:"conta / carteira",create:[f("name","Nome",true),f("institution","Instituição"),f("account_type","Tipo de conta",true,"select",
 [["checking","Conta corrente"],["savings","Poupança"],["cash","Dinheiro / carteira"],["other","Outro"]]),f("opening_balance","Saldo inicial (R$)",false,"number")]},
 card:{title:"cartão",create:[f("name","Nome do cartão",true),f("issuer","Emissor"),f("last4","Quatro últimos dígitos"),f("credit_limit","Limite (R$)",false,"number"),f("closing_day","Fecha dia",false,"number"),f("due_day","Vence dia",false,"number")]},
 vehicle:{title:"veículo",create:[f("nickname","Nome / apelido",true),f("plate","Placa"),f("make","Marca"),f("model","Modelo"),f("year","Ano",false,"number"),f("odometer_km","KM atual",false,"number"),f("estimated_value","Valor estimado (R$)",false,"number")],
 edit:[f("nickname","Nome / apelido",true),f("plate","Placa"),f("make","Marca"),f("model","Modelo"),f("year","Ano",false,"number"),f("odometer_km","KM atual",false,"number"),f("estimated_value","Valor estimado (R$)",false,"number"),f("status","Situação",true,"select",[["active","Ativo"],["inactive","Inativo"]])]},
 trip:{title:"frete / viagem",create:[f("customer_name","Cliente"),f("origin","Origem"),f("destination","Destino"),f("driver_name","Motorista"),f("service_date","Data",false,"date"),f("freight_revenue","Valor do frete (R$)",false,"number"),f("driver_cost","Motorista (R$)",false,"number")],
 edit:[f("customer_name","Cliente"),f("origin","Origem"),f("destination","Destino"),f("driver_name","Motorista"),f("service_date","Data",false,"date"),f("freight_revenue","Valor do frete (R$)",false,"number"),f("driver_cost","Motorista (R$)",false,"number"),f("distance_km","Distância (km)",false,"number"),f("reference","Referência"),f("status","Situação",true,"select",[["planned","Planejado"],["in_progress","Em andamento"],["completed","Concluído"],["cancelled","Cancelado"]])]},
 counterparty:{title:"pessoa / empresa",create:[f("name","Nome",true),f("kind","Tipo",true,"select",[["borrower","Devedor"],["customer","Cliente"],["supplier","Fornecedor"],["lender","Credor"],["driver","Motorista"],["other","Outro"]]),f("phone","Telefone"),f("email","E-mail"),f("document","CPF/CNPJ")]},
 recurring:{title:"recorrência",create:[f("name","Descrição",true),f("type","Tipo",true,"select",[["expense","Despesa"],["income","Receita"]]),f("amount","Valor (R$)",true,"number"),f("frequency","Frequência",true,"select",[["monthly","Mensal"],["weekly","Semanal"],["quarterly","Trimestral"],["yearly","Anual"],["custom","Personalizado"]]),f("due_day","Dia do vencimento",false,"number"),f("starts_on","A partir de",true,"date"),f("ends_on","Até",false,"date")]},
 reminder:{title:"lembrete",create:[f("description","Descrição",true),f("amount","Valor (R$)",false,"number"),f("due_date","Vencimento",true,"date")]},
 document:{title:"documento",create:[f("filename","Nome do arquivo",true),f("document_type","Classificação")]},
 loan:{title:"contrato de empréstimo",create:[
   f("counterparty_id","Devedor",true,"select"),f("principal","Capital (R$)",true,"number"),
   f("interest_type","Tipo",true,"select",[["simple","Juros simples"],["compound","Juros compostos"],["fixed","Juros fixos"]]),
   f("periodic_rate","Taxa de juros (%)",false,"number"),
   f("rate_period","Período",true,"select",[["month","Por mês"],["week","Por semana"],["day","Por dia"],["year","Por ano"]]),
   f("fixed_interest","Valor dos juros fixos (R$)",false,"number"),
   f("start_date","Data do empréstimo",true,"date"),f("maturity_date","Devolução do capital",false,"date"),
   f("interest_only","Somente juros mensais, sem amortização do capital",false,"checkbox"),
   f("late_fee_daily","Multa diária acordada (R$)",false,"number"),
   f("notes","Condições combinadas",false,"textarea"),
 ],edit:[f("maturity_date","Devolução do capital",false,"date"),f("notes","Condições combinadas",false,"textarea")]},
};
function defaultText(value:unknown,field:Field){
 if(value===null||value===undefined)return "";
 if(field.type==="date")return String(value).slice(0,10);
 return String(value);
}
export function RecordControl({category,workspace,record,lookups,label}:Props){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [removing,setRemoving]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [confirm,setConfirm]=useState("");
 const config=configs[category],editing=!!record?.id;
 const fields=editing?(config.edit||config.create):config.create;
 const close=()=>{if(busy)return;setOpen(false);setRemoving(false);setConfirm("");setError("");};
 async function save(event:React.FormEvent<HTMLFormElement>){
   event.preventDefault();setError("");setBusy(true);
   try{
     const form=new FormData(event.currentTarget);
     form.set("category",category);form.set("workspace",workspace);
     if(editing)form.set("record_id",String(record?.id));
     await saveLocalRecord(form);
     setOpen(false);router.refresh();
   }catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar.");}
   finally{setBusy(false);}
 }
 async function remove(){
   if(!editing||confirm!=="EXCLUIR")return;
   setBusy(true);setError("");
   try{
     const form=new FormData();
     form.set("category",category);form.set("workspace",workspace);
     form.set("record_id",String(record?.id));form.set("confirm",confirm);
     await removeLocalRecord(form);setRemoving(false);router.refresh();
   }catch(e){setError(e instanceof Error?e.message:"Não foi possível excluir.");}
   finally{setBusy(false);}
 }
 return <>
   <span className="record-actions">
     <button type="button" className={"button compact record-trigger"+(!editing?" primary":"")} onClick={()=>{setError("");setOpen(true);}}
       title={editing?"Editar registro":"Adicionar registro"}>
       {editing?<Pencil size={14}/>:<Plus size={16}/>} {label||(editing?"Editar":"Novo "+config.title)}
     </button>
     {editing&&<button type="button" className="button compact record-danger" onClick={()=>{setError("");setRemoving(true);}} title="Excluir registro"><Trash2 size={14}/> Excluir</button>}
   </span>
   {(open||removing)&&<div className="record-modal-backdrop" role="presentation">
     <div className="record-modal" role="dialog" aria-modal="true" aria-label={removing?"Excluir registro":"Cadastro de "+config.title}>
       <div className="record-modal-head"><h3>{removing?"Excluir "+config.title:editing?"Editar "+config.title:"Novo "+config.title}</h3>
         <button type="button" className="button compact" onClick={close} disabled={busy} aria-label="Fechar"><X size={16}/></button></div>
       {removing?<>
         <p className="metric-foot">Registros com pagamentos, conciliações ou históricos vinculados são protegidos. Cadastros sem movimentação podem ser desativados ou cancelados.</p>
         <label className="record-field">Digite <b>EXCLUIR</b> para confirmar
           <input value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="EXCLUIR" autoFocus/></label>
         {error&&<p className="record-error" role="alert">{error}</p>}
         <div className="record-modal-foot">
           <button type="button" className="button" onClick={close} disabled={busy}>Cancelar</button>
           <button type="button" className="button record-danger" disabled={busy||confirm!=="EXCLUIR"} onClick={()=>void remove()}>{busy?"Excluindo...":"Confirmar exclusão"}</button>
         </div>
       </>:<form onSubmit={e=>void save(e)} className="record-form">
         {fields.map(field=>{
           const value=defaultText(record?.[field.key],field);
           const isSelect=field.type==="select";
           let options=field.options;
           if(field.key==="counterparty_id")options=lookups?.counterparties?.map(x=>[x.id,x.name])||[];
           if(field.key==="account_id")options=lookups?.accounts?.map(x=>[x.id,x.name])||[];
           if(field.key==="card_id")options=lookups?.cards?.map(x=>[x.id,x.name])||[];
           if(field.key==="vehicle_id")options=lookups?.vehicles?.map(x=>[x.id,x.nickname])||[];
           return <label className="record-field" key={field.key}>{field.label}
             {isSelect?<select name={field.key} defaultValue={value||options?.[0]?.[0]||""} required={field.required}>
                {!field.required&&<option value="">Não informado</option>}
                {options?.map(([id,title])=><option key={id} value={id}>{title}</option>)}
               </select>:field.type==="textarea"?<textarea name={field.key} defaultValue={value} rows={3}/>:
               field.type==="checkbox"?<input name={field.key} type="checkbox" value="yes" defaultChecked={record?.[field.key]===true}/>:
               <input name={field.key} type={field.type==="date"?"date":field.type==="number"?"number":"text"}
                 inputMode={field.type==="number"?"decimal":undefined}
                 min={field.type==="number"?"0":undefined} step={field.type==="number"?"any":undefined}
                 required={field.required} defaultValue={value} />}
           </label>;
         })}
         {category==="loan"&&!editing&&<p className="metric-foot">Cadastrar não registra saída de dinheiro automaticamente. Taxa, juros e multa só devem refletir o contrato efetivamente combinado.</p>}
         {error&&<p className="record-error" role="alert">{error}</p>}
         <div className="record-modal-foot">
           <button type="button" className="button" onClick={close} disabled={busy}>Cancelar</button>
           <button type="submit" className="button primary" disabled={busy}>{busy?"Salvando...":"Salvar"}</button>
         </div>
       </form>}
     </div>
   </div>}
 </>;
}
