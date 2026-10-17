import "server-only";
/** Read-only capability check against the actually configured Evolution Go host. */
export async function evolutionGoCapabilityCheck(){
 const url=process.env.EVOLUTION_GO_API_URL;
 const token=process.env.EVOLUTION_GO_TOKEN;
 if(!url||!token)return {version:null,healthy:false,carouselAdvertised:false,
  details:"Evolution Go não configurada"};
 let base:string;
 try{
  const endpoint=new URL(url);
  if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password)throw Error("endpoint");
  base=endpoint.href.replace(/\/+$/,"");
 }catch{return {version:null,healthy:false,carouselAdvertised:false,details:"URL inválida"};}
 const targets=["/health","/version","/swagger/doc.json"];
 const results=await Promise.all(targets.map(async path=>{
  try{
   const response=await fetch(base+path,{
    headers:{apikey:token,Accept:"application/json"},cache:"no-store",
    signal:AbortSignal.timeout(5500)
   });
   if(!response.ok)return {ok:false,path};
   const len=Number(response.headers.get("content-length")||"0");
   if(len>350_000)return {ok:true,path};
   const data=await response.json().catch(()=>null) as {
     version?:unknown;info?:{version?:unknown};paths?:Record<string,unknown>
   }|null;
   const version=data?.info?.version||data?.version;
   return {ok:true,path,version:typeof version==="string"?version:null,
    carousel:path.includes("swagger")?Boolean(data?.paths?.["/send/carousel"]):undefined};
  }catch{return {ok:false,path};}
 }));
 const health=results.find(r=>r.path==="/health");
 const version=results.map(r=>r.version).find(v=>typeof v==="string")||null;
 return {version,healthy:Boolean(health?.ok),
  carouselAdvertised:results.some(r=>r.carousel===true),
  details:version?"Versão informada pelo servidor":
   "Instância não informa versão nos endpoints disponíveis"};
}
