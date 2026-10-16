"use client";
import {useEffect,useState} from "react";
type Status={matched?:boolean;status?:string|null;name?:string|null;period?:string;error?:string};
export function AnttMonthlyCheck(){
 const [status,setStatus]=useState<Status|null>(null);
 useEffect(()=>{
  let mounted=true;
  const run=async()=>{
   try{
    const r=await fetch("/api/fiscal/antt/snapshot",{cache:"no-store"});
    const result=await r.json() as Status;
    if(mounted)setStatus(result);
   }catch{if(mounted)setStatus({error:"Portal de dados da ANTT não respondeu."});}
  };
  void run();return ()=>{mounted=false;};
 },[]);
 return <section className="card" aria-label="Conferência oficial ANTT" style={{marginTop:12}}>
  <h3>RNTRC · Conferência automática da base ANTT</h3>
  {!status?<p>Consultando registros oficiais da ANTT...</p>:
   status.matched?<p>Base mensal {status.period}: <strong>{status.status}</strong> para {status.name}.</p>:
   <p>{status.error||"Cadastro não localizado na base oficial."}</p>}
  <p style={{fontSize:12,opacity:.8}}>O arquivo oficial de setembro/2026 foi atualizado em 10/10/2026.
   Esta conferência não substitui a situação em tempo real do RNTRC; a autorização fiscal continua condicionada às verificações oficiais.</p>
 </section>;
}
