import "server-only";
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
  const rows=Array.isArray(value)?value:Array.isArray(obj.data)?obj.data:Array.isArray(obj.pessoas)?obj.pessoas:Array.isArray(obj.items)?obj.items:[];
  const matches=rows.filter((p:unknown)=>{
   const row=p&&typeof p==="object"?p as Record<string,unknown>:{};
   return String(row.cpf_cnpj??row.cnpj??"").replace(/\D/g,"")===cpf;
  });
  const first=matches.length===1?matches[0] as Record<string,unknown>:null;
  return first&&(typeof first.id==="string"||typeof first.id==="number")?
   {ok:true,id:String(first.id),reason:null}:{ok:false,id:null,reason:"CADASTRO_NAO_ENCONTRADO"};
 }catch{return {ok:false,id:null,reason:"CONSULTA_INDISPONIVEL"};}
}
