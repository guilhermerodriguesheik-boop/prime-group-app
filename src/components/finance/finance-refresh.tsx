"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";
export function FinanceRefresh(){
 const router=useRouter();
 useEffect(()=>{
  const id=window.setInterval(()=>{
   if(document.visibilityState==="visible")router.refresh();
  },120000);
  return ()=>window.clearInterval(id);
 },[router]);
 return <button type="button" className="button" onClick={()=>router.refresh()}>
  Atualizar resumo financeiro
 </button>;
}
