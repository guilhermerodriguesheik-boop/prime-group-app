"use client";
import {useMemo,useState} from "react";
import {Search,Copy,Check} from "lucide-react";

type ArchiveRow={access_key:string|null;number:string|null;series:string|null;issued_at:string|null;
 total_value:number|null;status:string|null;source:string;sender_name:string|null;recipient_name:string|null};
const money=(value:number|null)=>value===null?"—":value.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function CteArchive({rows}:{rows:ArchiveRow[]}){
 const [filter,setFilter]=useState("");
 const [page,setPage]=useState(1);
 const [copied,setCopied]=useState("");
 const matches=useMemo(()=>rows.filter(row=>[row.number,row.series,row.access_key,row.sender_name,row.recipient_name,
  row.issued_at?new Date(row.issued_at).toLocaleDateString("pt-BR"):""]
   .join(" ").toLowerCase().includes(filter.trim().toLowerCase())),[rows,filter]);
 const perPage=15;
 const totalPages=Math.max(1,Math.ceil(matches.length/perPage));
 const displayed=matches.slice((Math.min(page,totalPages)-1)*perPage,Math.min(page,totalPages)*perPage);
 async function copyKey(key:string){
  try{await navigator.clipboard.writeText(key);setCopied(key);}catch{}
 }
 return <section aria-label="Histórico dos CT-e emitidos" className="fiscal-archive-panel">
  <div className="fiscal-section-intro"><div>
   <span className="fiscal-section-kicker">HISTÓRICO FISCAL / PRIME GROUP</span>
   <h2>CT-e emitidos</h2>
   <p>Histórico recuperado da Cargozilla e de DACTEs. O protocolo impresso não substitui a consulta SEFAZ.</p>
  </div><span className="fiscal-count">{rows.length} documento(s)</span></div>
  <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:12}}>
    <label style={{display:"flex",gap:8,alignItems:"center",flex:"1 1 260px"}}>
      <Search size={17} aria-hidden="true"/>
      <input aria-label="Buscar CT-e por número destinatário ou chave" value={filter}
        placeholder="Buscar número, destinatário ou chave..." onChange={e=>{setFilter(e.target.value);setPage(1)}}
        style={{width:"100%",padding:"10px 12px",borderRadius:8}} />
    </label>
    <small>{matches.length} resultado(s)</small>
  </div>
  <div className="table-wrap fiscal-data-table"><table>
   <thead><tr><th>Número</th><th>Série</th><th>Emissão</th><th>Destinatário</th>
   <th>Valor do frete</th><th>Chave</th><th>Origem</th><th>Situação</th></tr></thead>
   <tbody>{displayed.map((row,i)=><tr key={row.access_key||String(i)}>
     <td><strong>{row.number||"—"}</strong></td>
     <td>{row.series||"—"}</td>
     <td>{row.issued_at?new Date(row.issued_at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"—"}</td>
     <td>{row.recipient_name||"—"}</td>
     <td>{money(row.total_value===null?null:Number(row.total_value))}</td>
     <td>{row.access_key?<button title="Copiar chave CT-e" type="button" className="button"
       onClick={()=>void copyKey(row.access_key!)} aria-label="Copiar chave CT-e">
       {copied===row.access_key?<Check size={14}/>:<Copy size={14}/>}
       {row.access_key.slice(0,10)}…{row.access_key.slice(-6)}</button>:"—"}</td>
     <td>{row.source==="gmail_dacte"?"DACTE do Gmail":row.source==="video_dacte"?"DACTE da Cargozilla":"Importado"}</td>
     <td><span className="fiscal-cte-external">Protocolo no DACTE · conferir SEFAZ</span></td>
    </tr>)}
    {!displayed.length&&<tr><td colSpan={8} className="fiscal-empty">Nenhum CT-e encontrado.</td></tr>}
   </tbody></table></div>
  {totalPages>1&&<div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:12,marginTop:12}}>
     <button type="button" className="button" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</button>
     <small>Página {Math.min(page,totalPages)} de {totalPages}</small>
     <button type="button" className="button" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Próxima</button>
   </div>}
 </section>;
}
