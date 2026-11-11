"use client";
import {useMemo,useState} from "react";

export type DeliveryOrder={
 id:string;account_name:string;romaneio:string;document_number:string;document_kind:"NF"|"Pedido";
 carrier:string;recipient:string;neighborhood:string;
 source_stage:"faturado_no_piso"|"aguardando_faturamento";
 declared_volumes:number|null;collected_volumes:number|null;delivered_volumes:number|null;
 delivery_status:"a_conferir"|"aguardando_coleta"|"coletado"|"em_rota"|"entregue"|"ocorrencia"|"devolvido"|"cancelado";
 report_received_on:string|null;arrived_on:string|null;collected_on:string|null;departed_on:string|null;
 delivered_on:string|null;accounted_on:string|null;invoiced_on:string|null;
 unit_rate:number|null;driver_name:string;proof_reference:string;notes:string;source_filename:string;
};
type Draft=Pick<DeliveryOrder,"romaneio"|"document_number"|"document_kind"|"carrier"|"recipient"|"neighborhood"|"source_stage"|"declared_volumes">&{include:boolean};
const stages:Record<DeliveryOrder["source_stage"],string>={
 faturado_no_piso:"Faturado no piso",aguardando_faturamento:"Aguardando faturamento"
};
const statuses:Record<DeliveryOrder["delivery_status"],string>={
 a_conferir:"A conferir",aguardando_coleta:"Aguardando coleta",coletado:"Coletado",em_rota:"Em rota",
 entregue:"Entregue",ocorrencia:"Ocorrência",devolvido:"Devolvido",cancelado:"Cancelado"
};
const control:React.CSSProperties={width:"100%",padding:"9px 10px",border:"1px solid #94A3B8",borderRadius:8,background:"transparent",color:"inherit",minWidth:90};
const amount=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n);
const dateLabel=(v:string|null)=>v?new Date(v+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"}):"—";
function shiftDay(day:string,days:number){return new Date(Date.parse(day+"T12:00:00Z")+days*86400000).toISOString().slice(0,10)}
function monday(day:string){const d=new Date(day+"T12:00:00Z");return shiftDay(day,-((d.getUTCDay()+6)%7))}
function payable(o:DeliveryOrder){
 return !o.invoiced_on&&o.delivery_status==="entregue"&&Boolean(o.delivered_on)&&Boolean(o.accounted_on)
 &&o.declared_volumes!==null&&o.declared_volumes===o.collected_volumes
 &&o.collected_volumes!==null&&o.collected_volumes===o.delivered_volumes
 &&Number(o.unit_rate)>0;
}
function csvCell(value:string|number){
 let s=String(value);
 if(/^[=+\-@]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
async function jsonFetch(path:string,init?:RequestInit){
 const response=await fetch(path,{cache:"no-store",...init});
 const result=await response.json().catch(()=>({error:"Resposta inválida."}));
 if(!response.ok)throw Error(String(result.error||"Não foi possível concluir a operação."));
 return result;
}
export function DeliveryBoard({initialOrders,today,loadError}:{initialOrders:DeliveryOrder[];today:string;loadError:string|null}){
 const [orders,setOrders]=useState(initialOrders);
 const [account,setAccount]=useState("");
 const [image,setImage]=useState<File|null>(null);
 const [reportDate,setReportDate]=useState(today);
 const [preview,setPreview]=useState<Draft[]>([]);
 const [scanNotes,setScanNotes]=useState("");
 const [edit,setEdit]=useState<DeliveryOrder|null>(null);
 const [filter,setFilter]=useState("");
 const [search,setSearch]=useState("");
 const [billAccount,setBillAccount]=useState("");
 const [weekStart,setWeekStart]=useState(monday(today));
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const accounts=useMemo(()=>[...new Set(orders.map(x=>x.account_name))].sort(),[orders]);
 const shown=useMemo(()=>orders.filter(o=>(!filter||o.delivery_status===filter)&&
   (!search||[o.romaneio,o.recipient,o.neighborhood,o.document_number,o.account_name].join(" ").toLowerCase().includes(search.toLowerCase()))),[orders,filter,search]);
 const weekEnd=shiftDay(weekStart,6);
 const weekOrders=useMemo(()=>orders.filter(o=>o.account_name===billAccount&&
  o.accounted_on!==null&&o.accounted_on>=weekStart&&o.accounted_on<=weekEnd&&payable(o)),[orders,billAccount,weekStart,weekEnd]);
 const billVolumes=weekOrders.reduce((n,o)=>n+Number(o.delivered_volumes||0),0);
 const billCents=weekOrders.reduce((n,o)=>n+Math.round(Number(o.unit_rate||0)*100)*Number(o.delivered_volumes||0),0);
 const pendingImage=orders.filter(o=>o.declared_volumes===null).length;
 const refresh=async()=>{const result=await jsonFetch("/api/entregas");setOrders(result.orders as DeliveryOrder[])};
 async function readImage(){
  if(!image){setMessage("Selecione a imagem ou PDF da relação.");return}
  setBusy(true);setMessage("");
  try{const body=new FormData();body.append("file",image);
   const result=await jsonFetch("/api/entregas/ler-imagem",{method:"POST",body});
   setPreview((result.rows as Omit<Draft,"include">[]).map(row=>({...row,include:true})));
   setScanNotes(String(result.notes||""));
   setMessage("Tabela extraída. Revise TODAS as linhas e os volumes antes de salvar.");
  }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível ler a imagem.")}
  finally{setBusy(false)}
 }
 const updateDraft=(i:number,key:keyof Draft,value:string|number|boolean|null)=>
  setPreview(old=>old.map((row,k)=>k===i?{...row,[key]:value}:row));
 async function importPreview(){
  if(!account.trim()){setMessage("Informe o nome da empresa que contrata as entregas.");return}
  const selected=preview.filter(x=>x.include);
  if(!selected.length){setMessage("Selecione pelo menos um pedido.");return}
  const wrong=selected.find(x=>!/^\d{3,14}$/.test(x.romaneio)||x.recipient.trim().length<2);
  if(wrong){setMessage("Há linha sem romaneio ou destinatário. Corrija ou desmarque antes de importar.");return}
  setBusy(true);
  try{const result=await jsonFetch("/api/entregas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
   action:"import",account_name:account,report_received_on:reportDate,source_filename:image?.name||"foto",
   rows:selected.map(({include,...row})=>row)
  })});
   await refresh();setPreview([]);setBillAccount(account.trim().toUpperCase());
   setMessage(`Importação concluída: ${result.created} novos pedidos; ${result.duplicates} já existentes. Os pedidos ainda exigem conferência operacional.`);
  }catch(e){setMessage(e instanceof Error?e.message:"Falha ao importar.")}
  finally{setBusy(false)}
 }
 function changeEdit(key:keyof DeliveryOrder,value:string|number|null){setEdit(prev=>prev?{...prev,[key]:value}:null)}
 async function saveEdit(){
  if(!edit)return;
  setBusy(true);setMessage("");
  try{await jsonFetch("/api/entregas",{method:"PATCH",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({...edit,action:"update"})});
   await refresh();setEdit(null);setMessage("Pedido atualizado.");
  }catch(e){setMessage(e instanceof Error?e.message:"Falha ao salvar.")}
  finally{setBusy(false)}
 }
 function exportCsv(){
  if(!weekOrders.length)return;
  const headers=["Contratante","Romaneio","Documento","Transportadora","Destinatário","Bairro",
   "Volumes nota","Volumes coletados","Volumes entregues","Tarifa por volume","Valor",
   "Data entrega","Prestação de contas","Comprovante"];
  const rows=weekOrders.map(o=>[o.account_name,o.romaneio,o.document_kind+" "+o.document_number,
   o.carrier,o.recipient,o.neighborhood,o.declared_volumes||0,o.collected_volumes||0,
   o.delivered_volumes||0,Number(o.unit_rate||0).toFixed(2).replace(".",","),
   (Math.round(Number(o.unit_rate||0)*100)*Number(o.delivered_volumes||0)/100).toFixed(2).replace(".",","),
   dateLabel(o.delivered_on),dateLabel(o.accounted_on),o.proof_reference||""]);
  rows.push([billAccount,"TOTAL","","","","","", "",billVolumes,"", (billCents/100).toFixed(2).replace(".",","),"","",""]);
  const raw="\uFEFF"+[headers,...rows].map(row=>row.map(v=>csvCell(String(v))).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([raw],{type:"text/csv;charset=utf-8;"}));
  const a=document.createElement("a");a.href=url;a.download=`faturamento-${billAccount.replace(/[^a-z0-9]/gi,"-")}-${weekStart}.csv`;
  a.click();URL.revokeObjectURL(url);
 }
 async function closeWeek(){
  if(!weekOrders.length)return;
  if(!window.confirm(`Confirmar faturamento de ${weekOrders.length} pedidos, ${billVolumes} volumes, ${amount(billCents/100)}? Eles serão bloqueados contra alterações e cobrança repetida.`))return;
  setBusy(true);
  try{await jsonFetch("/api/entregas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
   action:"close",account_name:billAccount,week_start:weekStart,week_end:weekEnd,invoice_date:today,ids:weekOrders.map(x=>x.id)
  })});await refresh();setMessage("Semana faturada e pedidos bloqueados contra duplicidade.");
  }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível fechar a semana.")}
  finally{setBusy(false)}
 }
 const numericField=(label:string,key:keyof DeliveryOrder)=>(
  <label style={{display:"grid",gap:5,fontSize:13}}>{label}
   <input style={control} type="number" min="1" max="50000" value={(edit?.[key] as number|null)??""}
    onChange={e=>changeEdit(key,e.target.value===""?null:Number(e.target.value))}/>
  </label>);
 const dateField=(label:string,key:keyof DeliveryOrder)=>(
  <label style={{display:"grid",gap:5,fontSize:13}}>{label}
   <input style={control} type="date" value={(edit?.[key] as string|null)??""} onChange={e=>changeEdit(key,e.target.value||null)}/>
  </label>);
 return <div style={{display:"grid",gap:24}}>
  {loadError&&<div className="notice attention" role="alert">{loadError}</div>}
  {message&&<div className="notice" role="status">{message}</div>}
  <section className="card" style={{display:"grid",gap:14}}>
   <h2>1. Importar relação diária</h2>
   <p style={{fontSize:13}}>Envie foto ou PDF. A leitura automática prepara uma conferência; nenhum pedido entra no banco sem você confirmar.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
    <label style={{display:"grid",gap:5}}>Contratante
     <input style={control} placeholder="Nome do cliente que paga o frete" value={account} onChange={e=>setAccount(e.target.value)} maxLength={100}/></label>
    <label style={{display:"grid",gap:5}}>Data de recebimento da relação
     <input style={control} type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></label>
    <label style={{display:"grid",gap:5}}>Arquivo
     <input style={control} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e=>setImage(e.target.files?.[0]||null)}/></label>
   </div>
   <div><button type="button" className="button primary" disabled={busy||Boolean(loadError)} onClick={readImage}>{busy?"Processando...":"Ler imagem / PDF"}</button></div>
   {preview.length>0&&<>
    <div><strong>Conferência da foto: {preview.length} linhas</strong>
     <p style={{fontSize:12}}>Volumes ausentes: {preview.filter(x=>x.include&&x.declared_volumes===null).length}. Podem ficar pendentes, mas não serão faturados até a conferência.</p>
     {scanNotes&&<p style={{fontSize:12}}>Observação da leitura: {scanNotes}</p>}
    </div>
    <div className="table-wrap"><table><thead><tr><th>Importar</th><th>Origem</th><th>Romaneio</th><th>NF/Pedido</th><th>Destinatário</th><th>Bairro</th><th>Volumes</th></tr></thead><tbody>
     {preview.map((r,i)=><tr key={i} style={{opacity:r.include?1:.5}}>
      <td><input type="checkbox" checked={r.include} onChange={e=>updateDraft(i,"include",e.target.checked)}/></td>
      <td><select style={control} value={r.source_stage} onChange={e=>updateDraft(i,"source_stage",e.target.value)}>
       {Object.entries(stages).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td>
      <td><input style={control} value={r.romaneio} onChange={e=>updateDraft(i,"romaneio",e.target.value.replace(/\D/g,""))}/></td>
      <td><input style={control} value={r.document_number} onChange={e=>updateDraft(i,"document_number",e.target.value)}/></td>
      <td><input style={{...control,minWidth:190}} value={r.recipient} onChange={e=>updateDraft(i,"recipient",e.target.value)}/></td>
      <td><input style={control} value={r.neighborhood} onChange={e=>updateDraft(i,"neighborhood",e.target.value)}/></td>
      <td><input aria-label="Volumes informados" type="number" min="1" style={{...control,maxWidth:110,background:r.declared_volumes===null?"#FEF3C7":undefined,color:r.declared_volumes===null?"#7C2D12":undefined}}
       value={r.declared_volumes??""} onChange={e=>updateDraft(i,"declared_volumes",e.target.value===""?null:Number(e.target.value))}/></td>
     </tr>)}
    </tbody></table></div>
    <div><button type="button" className="button primary" disabled={busy||Boolean(loadError)} onClick={importPreview}>Confirmar e salvar pedidos</button></div>
   </>}
  </section>
  <section className="card" style={{display:"grid",gap:14}}>
   <h2>2. Pedidos e baixas</h2>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
    <div><strong>{orders.length}</strong><div style={{fontSize:12}}>Pedidos cadastrados</div></div>
    <div><strong>{orders.filter(o=>o.delivery_status==="entregue").length}</strong><div style={{fontSize:12}}>Entregues</div></div>
    <div><strong>{orders.filter(o=>o.accounted_on&&!o.invoiced_on).length}</strong><div style={{fontSize:12}}>Prestados, ainda não faturados</div></div>
    <div><strong>{pendingImage}</strong><div style={{fontSize:12}}>Sem volumes na relação</div></div>
   </div>
   <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
    <input style={{...control,maxWidth:320}} placeholder="Buscar romaneio, nome ou bairro" value={search} onChange={e=>setSearch(e.target.value)}/>
    <select style={{...control,maxWidth:240}} value={filter} onChange={e=>setFilter(e.target.value)}>
      <option value="">Todos os status</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}
    </select>
    <button className="button" type="button" onClick={()=>void refresh().catch(e=>setMessage(String(e)))}>Atualizar</button>
   </div>
   {edit&&<div style={{padding:15,border:"2px solid #94A3B8",borderRadius:12,display:"grid",gap:13}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
     <strong>Editar romaneio {edit.romaneio} · {edit.recipient}</strong>
     <button type="button" className="button" onClick={()=>setEdit(null)}>Fechar</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12}}>
     <label style={{display:"grid",gap:5,fontSize:13}}>Status da entrega
      <select style={control} value={edit.delivery_status} onChange={e=>changeEdit("delivery_status",e.target.value)}>
       {Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
     <label style={{display:"grid",gap:5,fontSize:13}}>Situação no relatório
      <select style={control} value={edit.source_stage} onChange={e=>changeEdit("source_stage",e.target.value)}>
       {Object.entries(stages).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
     {numericField("Volumes da nota", "declared_volumes")}
     {numericField("Volumes coletados", "collected_volumes")}
     {numericField("Volumes entregues", "delivered_volumes")}
     <label style={{display:"grid",gap:5,fontSize:13}}>Tarifa por volume (R$)
      <input style={control} type="number" min="0" step="0.01" value={edit.unit_rate??""}
       onChange={e=>changeEdit("unit_rate",e.target.value===""?null:Number(e.target.value))}/></label>
     {dateField("Chegada da carga","arrived_on")}
     {dateField("Coleta","collected_on")}
     {dateField("Saída","departed_on")}
     {dateField("Entrega","delivered_on")}
     {dateField("Prestação de contas","accounted_on")}
     <label style={{display:"grid",gap:5,fontSize:13}}>Motorista
      <input style={control} value={edit.driver_name} onChange={e=>changeEdit("driver_name",e.target.value)}/></label>
     <label style={{display:"grid",gap:5,fontSize:13}}>NF / Pedido
      <input style={control} value={edit.document_number} onChange={e=>changeEdit("document_number",e.target.value)}/></label>
     <label style={{display:"grid",gap:5,fontSize:13}}>Tipo documento
      <select style={control} value={edit.document_kind} onChange={e=>changeEdit("document_kind",e.target.value)}>
       <option>NF</option><option>Pedido</option></select></label>
     <label style={{display:"grid",gap:5,fontSize:13}}>Transportadora da relação
      <input style={control} value={edit.carrier} onChange={e=>changeEdit("carrier",e.target.value)}/></label>
     <label style={{display:"grid",gap:5,fontSize:13}}>Destinatário
      <input style={control} value={edit.recipient} onChange={e=>changeEdit("recipient",e.target.value)}/></label>
     <label style={{display:"grid",gap:5,fontSize:13}}>Bairro
      <input style={control} value={edit.neighborhood} onChange={e=>changeEdit("neighborhood",e.target.value)}/></label>
    </div>
    <label style={{display:"grid",gap:5,fontSize:13}}>Nº/identificação do comprovante de entrega
      <input style={control} value={edit.proof_reference} onChange={e=>changeEdit("proof_reference",e.target.value)}/></label>
    <label style={{display:"grid",gap:5,fontSize:13}}>Observações / ocorrência
      <textarea style={control} rows={2} value={edit.notes} onChange={e=>changeEdit("notes",e.target.value)}/></label>
    <div style={{fontSize:12}}>Para prestar contas, registre data de entrega, data da prestação e três quantidades de volumes iguais. Se houver diferença, registre ocorrência e resolva antes da cobrança.</div>
    <div><button type="button" className="button primary" disabled={busy} onClick={saveEdit}>Salvar baixa / alterações</button></div>
   </div>}
   <div className="table-wrap"><table><thead><tr><th>Romaneio</th><th>Destinatário</th><th>Bairro</th><th>NF/Pedido</th><th>Volumes nota / coleta / entrega</th><th>Status</th><th>Prestação</th><th>Faturamento</th><th>Ações</th></tr></thead><tbody>
    {shown.slice(0,1000).map(o=><tr key={o.id}>
      <td><strong>{o.romaneio}</strong><div style={{fontSize:11}}>{o.account_name}</div></td>
      <td>{o.recipient}</td><td>{o.neighborhood}</td>
      <td>{o.document_kind} {o.document_number}</td>
      <td style={{whiteSpace:"nowrap"}}>{o.declared_volumes??"?"} / {o.collected_volumes??"?"} / {o.delivered_volumes??"?"}
       {o.declared_volumes!==null&&o.collected_volumes!==null&&o.delivered_volumes!==null&&
       !(o.declared_volumes===o.collected_volumes&&o.collected_volumes===o.delivered_volumes)&&
        <div style={{fontSize:11,color:"#B91C1C"}}>DIVERGÊNCIA</div>}</td>
      <td>{statuses[o.delivery_status]}</td>
      <td>{dateLabel(o.accounted_on)}</td>
      <td>{o.invoiced_on?"Fechado em "+dateLabel(o.invoiced_on):"Em aberto"}</td>
      <td>{o.invoiced_on?<span style={{fontSize:12}}>Bloqueado</span>:
       <button type="button" className="button" onClick={()=>setEdit({...o})}>Dar baixa / editar</button>}</td>
    </tr>)}
    {!shown.length&&<tr><td colSpan={9}>Nenhum pedido cadastrado nesse filtro.</td></tr>}
   </tbody></table></div>
   {shown.length>1000&&<p>Mostrando os primeiros mil pedidos. Use a busca para localizar os demais.</p>}
  </section>
  <section className="card" style={{display:"grid",gap:14}}>
    <h2>3. Fechamento e faturamento semanal</h2>
    <p style={{fontSize:13}}>A cobrança considera a data da prestação de contas. Apenas pedidos entregues, com volumes idênticos e tarifa cadastrada entram no fechamento.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
     <label style={{display:"grid",gap:5}}>Contratante
      <select style={control} value={billAccount} onChange={e=>setBillAccount(e.target.value)}>
       <option value="">Selecionar cliente</option>{accounts.map(x=><option key={x}>{x}</option>)}</select></label>
     <label style={{display:"grid",gap:5}}>Segunda-feira da semana
      <input style={control} type="date" value={weekStart} onChange={e=>setWeekStart(monday(e.target.value||today))}/></label>
     <div style={{alignSelf:"end",fontSize:13}}>Período: {dateLabel(weekStart)} a {dateLabel(weekEnd)}</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
     <div><strong style={{fontSize:24}}>{weekOrders.length}</strong><div style={{fontSize:12}}>Pedidos faturáveis</div></div>
     <div><strong style={{fontSize:24}}>{billVolumes}</strong><div style={{fontSize:12}}>Volumes conferidos</div></div>
     <div><strong style={{fontSize:24}}>{amount(billCents/100)}</strong><div style={{fontSize:12}}>Total da semana</div></div>
    </div>
    <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
     <button type="button" className="button" disabled={weekOrders.length===0} onClick={exportCsv}>Baixar relação Excel (CSV)</button>
     <button type="button" className="button primary" disabled={busy||weekOrders.length===0} onClick={closeWeek}>Marcar semana como faturada</button>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Romaneio</th><th>Destinatário</th><th>Volumes</th><th>Tarifa</th><th>Valor</th><th>Prestação</th></tr></thead><tbody>
     {weekOrders.map(o=><tr key={o.id}><td>{o.romaneio}</td><td>{o.recipient}</td><td>{o.delivered_volumes}</td>
      <td>{amount(Number(o.unit_rate||0))}</td><td>{amount(Math.round(Number(o.unit_rate||0)*100)*Number(o.delivered_volumes||0)/100)}</td>
      <td>{dateLabel(o.accounted_on)}</td></tr>)}
     {!weekOrders.length&&<tr><td colSpan={6}>Nenhum pedido pronto para cobrança nessa semana.</td></tr>}
    </tbody></table></div>
    <p style={{fontSize:12}}>Importar a imagem não faz cobrança. O botão de fechamento altera apenas pedidos elegíveis e evita faturamento repetido. Não emite NF-e automaticamente.</p>
  </section>
 </div>
}
