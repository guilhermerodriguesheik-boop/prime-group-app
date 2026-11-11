import "server-only";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
export const runtime="nodejs";
export const maxDuration=90;
const fail=(error:string,status=400)=>NextResponse.json({error},{status,headers:{"Cache-Control":"no-store"}});
const rowSchema={
 type:"object",additionalProperties:false,
 properties:{
  romaneio:{type:["string","null"]},
  document_number:{type:["string","null"]},
  document_kind:{type:"string",enum:["NF","Pedido"]},
  carrier:{type:["string","null"]},
  recipient:{type:["string","null"]},
  neighborhood:{type:["string","null"]},
  source_stage:{type:"string",enum:["faturado_no_piso","aguardando_faturamento"]},
  declared_volumes:{type:["integer","null"]},
 },
 required:["romaneio","document_number","document_kind","carrier","recipient","neighborhood","source_stage","declared_volumes"]
};
type Scanned={rows:Array<{romaneio:string|null;document_number:string|null;document_kind:"NF"|"Pedido";
 carrier:string|null;recipient:string|null;neighborhood:string|null;
 source_stage:"faturado_no_piso"|"aguardando_faturamento";declared_volumes:number|null}>;notes:string};
export async function POST(req:Request){
 const origin=req.headers.get("origin");if(origin&&origin!==new URL(req.url).origin)return fail("Origem inválida.",403);
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();if(!user)return fail("Faça login.",401);
 const {data:ws}=await db.from("workspaces").select("id").eq("kind","prime").eq("owner_id",user.id).maybeSingle();
 if(!ws)return fail("Ambiente Prime não localizado.",403);
 if(!process.env.OPENAI_API_KEY)return fail("A chave OpenAI do aplicativo precisa estar configurada para ler imagens.",503);
 const form=await req.formData().catch(()=>null),file=form?.get("file");
 if(!(file instanceof File))return fail("Envie uma imagem ou PDF.");
 const mime=file.type;
 if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(mime))return fail("Formato aceito: JPG, PNG, WebP ou PDF.");
 if(file.size<100||file.size>3*1024*1024)return fail("Arquivo precisa ter entre 100 bytes e 3 MB.");
 const base64=Buffer.from(await file.arrayBuffer()).toString("base64");
 const visual=mime==="application/pdf"
   ?{type:"input_file",filename:file.name.slice(0,100),file_data:`data:application/pdf;base64,${base64}`}
   :{type:"input_image",image_url:`data:${mime};base64,${base64}`,detail:"high"};
 const schema={
  type:"object",additionalProperties:false,
  properties:{
   rows:{type:"array",items:rowSchema},
   notes:{type:"string"},
  },required:["rows","notes"]
 };
 const prompt=`Leia TODAS as linhas da(s) tabela(s) desta relação de entregas. Uma linha é um pedido.
 Separe cabeçalhos "PEDIDOS FATURADOS NO PISO" (source_stage=faturado_no_piso; document_kind=NF)
 e "PEDIDOS AGUARDANDO FATURAMENTO" (source_stage=aguardando_faturamento; document_kind=Pedido).
 Campos: romaneio, NF ou Pedido, transportadora, destinatário/nome, número de volumes, bairro.
 Não confunda o número de pedido/NF com volumes; não some volumes de uma linha na outra.
 IMPORTANTE: traço azul, imagem cortada, valor oculto, ilegível ou incerto = null. Nunca invente.
 Registre cada linha mesmo que alguns campos estejam null. Preserve a ordem e os nomes da imagem.
 Não interprete "faturado no piso" como entregue. Não calcule frete ou faturamento.
 Se houver dúvida informe nas notes. Retorne apenas os campos do JSON exigido.`;
 try{
  const response=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
   signal:AbortSignal.timeout(85000),
   body:JSON.stringify({
    model:process.env.PRIME_VISION_MODEL||"gpt-4o-mini",store:false,
    input:[{role:"user",content:[{type:"input_text",text:prompt},visual]}],
    text:{format:{type:"json_schema",name:"prime_delivery_image_rows",strict:true,schema}},
    max_output_tokens:10000,
   })
  });
  if(!response.ok){console.error("delivery image AI HTTP",response.status);return fail("A leitura visual falhou. Tente outra imagem.",503)}
  const body=await response.json() as {status?:string;output?:Array<{content?:Array<{type:string;text?:string}>}>};
  if(body.status==="incomplete")return fail("A imagem possui muitas linhas; divida em duas partes e envie separadamente.",422);
  const text=body.output?.flatMap(x=>x.content||[]).find(x=>x.type==="output_text")?.text;
  if(!text)return fail("Não foi possível obter uma tabela legível.",422);
  const parsed=JSON.parse(text) as Scanned;
  if(!Array.isArray(parsed.rows)||!parsed.rows.length||parsed.rows.length>120)return fail("Nenhum pedido identificado ou excesso de linhas.",422);
  const rows=parsed.rows.map(row=>({
   romaneio:String(row.romaneio||"").replace(/\D/g,""),
   document_number:String(row.document_number||"").trim(),
   document_kind:row.document_kind,
   carrier:String(row.carrier||"").trim(),
   recipient:String(row.recipient||"").trim(),
   neighborhood:String(row.neighborhood||"").trim(),
   source_stage:row.source_stage,
   declared_volumes:Number.isInteger(row.declared_volumes)&&Number(row.declared_volumes)>0?row.declared_volumes:null,
  }));
  return NextResponse.json({rows,notes:String(parsed.notes||"").slice(0,1000),
    reviewRequired:rows.filter(x=>!x.romaneio||!x.recipient||!x.declared_volumes).length},
    {headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("delivery image error",e instanceof Error?e.name:"unknown");
  return fail("Falha ao processar a imagem. Verifique a conexão e tente novamente.",503)}
}
