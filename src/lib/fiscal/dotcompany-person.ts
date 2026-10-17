import "server-only";
import {createHash} from "node:crypto";
export async function consultTransportPerson(token:string,cpfCnpj:string){
 const cpf=cpfCnpj.replace(/\D/g,"");
 if(!/^\d{11}(?:\d{3})?$/.test(cpf))return {ok:false,id:null,reason:"DOCUMENTO_INVALIDO"};
 const u=new URL("https://erp.dotcompany.com.br/api/v1/pessoas");
 u.searchParams.set("cpf_cnpj",cpf);
 try{
  const res=await fetch(u,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(12000)});
  const value=await res.json().catch(()=>null) as unknown;
  if(!res.ok)return {ok:false,id:null,reason:"HTTP_"+res.status};
  const obj=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const rows=Array.isArray(value)?value:Array.isArray(obj.data)?obj.data:Array.isArray(obj.pessoas)?obj.pessoas:Array.isArray(obj.items)?obj.items:Array.isArray(obj.results)?obj.results:Object.keys(obj).includes("id")?[obj]:[];
  const matches=rows.filter((p:unknown)=>{
   const row=p&&typeof p==="object"?p as Record<string,unknown>:{};
   return String(row.cpf_cnpj??row.cnpj??"").replace(/\D/g,"")===cpf;
  });
  const first=matches.length===1?matches[0] as Record<string,unknown>:null;
  return first&&(typeof first.id==="string"||typeof first.id==="number")?
   {ok:true,id:String(first.id),reason:null}:{ok:false,id:null,reason:"CADASTRO_NAO_ENCONTRADO"};
 }catch{return {ok:false,id:null,reason:"CONSULTA_INDISPONIVEL"};}
}

export async function ensureTransportPerson(token:string,input:{cpfCnpj:string;name:string}){
 const doc=input.cpfCnpj.replace(/\D/g,"");
 const name=input.name.trim();
 if(!/^\d{14}$/.test(doc)||name.length<5) return {ok:false,id:null,reason:"PESSOA_FISCAL_INCOMPLETA"};
 const existing=await consultTransportPerson(token,doc);
 if(existing.ok)return existing;
 if(!["CADASTRO_NAO_ENCONTRADO"].includes(existing.reason||""))return existing;
 // Idempotent by CPF/CNPJ, as documented by DotCompany.
 const hash=createHash("sha256").update("prime-pessoa:"+doc).digest("hex");
 const idem=[hash.slice(0,8),hash.slice(8,12),"4"+hash.slice(13,16),"a"+hash.slice(17,20),hash.slice(20,32)].join("-");
 try{
  const response=await fetch("https://erp.dotcompany.com.br/api/v1/pessoas",{
   method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",
    Accept:"application/json","Idempotency-Key":idem},
   body:JSON.stringify({cpf_cnpj:doc,nome:name}),cache:"no-store",signal:AbortSignal.timeout(15000),
  });
  const payload=await response.json().catch(()=>null) as unknown;
  const body=payload&&typeof payload==="object"&&!Array.isArray(payload)?payload as Record<string,unknown>:{};
  const nested=body.data&&typeof body.data==="object"&&!Array.isArray(body.data)?body.data as Record<string,unknown>:body;
  const id=nested.id??nested.pessoa_id;
  if(response.ok&&(typeof id==="string"||typeof id==="number")){
   const match=String(nested.cpf_cnpj??nested.cnpj??doc).replace(/\D/g,"");
   if(match===doc)return {ok:true,id:String(id),reason:null};
  }
  // Provider may have created it without returning an id; confirm by GET.
  const again=await consultTransportPerson(token,doc);
  if(again.ok)return again;
  return {ok:false,id:null,reason:"CADASTRO_PESSOA_HTTP_"+response.status};
 }catch{return {ok:false,id:null,reason:"CADASTRO_PESSOA_RESULTADO_INCERTO"};}
}
