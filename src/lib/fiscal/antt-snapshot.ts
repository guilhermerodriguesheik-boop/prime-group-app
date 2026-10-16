/** Official ANTT open data snapshot, September 2026. Not real-time. */
export const RESOURCE_ID="c77e6837-3f77-4c12-9937-e0f212a6a9a0";
export const REFERENCE_MONTH="2026-09";
const digits=(x:unknown)=>String(x??"").replace(/\D/g,"");
export type Check={checked:boolean;matched:boolean;period:string;status:string|null;name:string|null;error?:string};
export async function checkAnttSnapshot(rntrc:string,cnpj:string,fetcher:typeof fetch=fetch):Promise<Check>{
 const initial:Check={checked:false,matched:false,period:REFERENCE_MONTH,status:null,name:null};
 if(!/^\d{8,9}$/.test(digits(rntrc))||!/^\d{14}$/.test(digits(cnpj)))
  return {...initial,error:"RNTRC ou CNPJ inválido."};
 const url=new URL("https://dados.antt.gov.br/api/3/action/datastore_search");
 url.searchParams.set("resource_id",RESOURCE_ID);
 url.searchParams.set("filters",JSON.stringify({numero_rntrc:Number(digits(rntrc))}));
 url.searchParams.set("limit","10");
 let res:Response;
 try{res=await fetcher(url.toString(),{method:"GET",headers:{Accept:"application/json"},
  cache:"no-store",signal:AbortSignal.timeout(15000)});}
 catch{return {...initial,error:"Base pública da ANTT indisponível."};}
 if(!res.ok)return {...initial,error:"Base pública da ANTT retornou HTTP "+res.status+"."};
 let content:unknown;
 try{content=await res.json()}catch{return {...initial,error:"Formato de resposta ANTT inesperado."};}
 if(!content||typeof content!=="object")return {...initial,error:"Resposta ANTT não reconhecida."};
 const data=content as {success?:boolean;result?:{records?:unknown[]}};
 if(data.success!==true||!Array.isArray(data.result?.records))
  return {...initial,error:"Resposta ANTT sem registros verificáveis."};
 const found=data.result.records.filter((v):v is Record<string,unknown>=>!!v&&typeof v==="object")
  .find(x=>digits(x.numero_rntrc)===digits(Number(digits(rntrc)))&&
   digits(x.cpfcnpjtransportador)===digits(cnpj));
 if(!found)return {...initial,checked:true,error:"Nenhuma correspondência exata RNTRC e CNPJ na base mensal."};
 return {...initial,checked:true,matched:true,
  status:String(found.situacao_rntrc||"Não informado").slice(0,80),
  name:String(found.nome_transportador||"").slice(0,140)};
}
