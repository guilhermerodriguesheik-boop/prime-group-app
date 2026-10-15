"use client";
import { useState } from "react";
export function FiscalAiReview({draftId}:{draftId:string}){
  const [busy,setBusy]=useState(false);
  const [review,setReview]=useState("");
  async function reviewDraft(){
    setBusy(true);setReview("");
    try{
      const response=await fetch("/api/fiscal/review",{
        method:"POST",headers:{"Content-Type":"application/json","x-prime-action":"fiscal-ai-review"},
        body:JSON.stringify({draftId}),
      });
      const data=await response.json() as {error?:string;review?:string};
      if(!response.ok)throw Error(data.error||"Revisão indisponível.");
      setReview(data.review||"Sem resultado.");
    }catch(error){
      setReview(error instanceof Error?error.message:"Falha na revisão.");
    }finally{setBusy(false);}
  }
  return <div>
    <button className="button" type="button" onClick={reviewDraft} disabled={busy}>
      {busy?"Analisando...":"Conferir com IA"}
    </button>
    {review&&<div className="notice" role="status"
      style={{marginTop:10,whiteSpace:"pre-wrap",maxWidth:620}}>{review}</div>}
  </div>;
}
