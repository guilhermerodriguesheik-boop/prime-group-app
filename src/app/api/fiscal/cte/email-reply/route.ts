import "server-only";
import {NextResponse} from "next/server";
import {createClient as adminClient} from "@supabase/supabase-js";
import {session} from "@/lib/fiscal/cte-data";
import {sendAuthorizedCteReply} from "@/lib/fiscal/gmail";
export const runtime="nodejs";
export const maxDuration=60;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function admin(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error("Banco fiscal não configurado.");
 return adminClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
async function lookup(draftId:string){
 const s=await session();
 if(!s)return null;
 const db=admin();
 const [{data:draft},{data:trans},{data:source},{data:existing}]=await Promise.all([
  db.from("fiscal_drafts").select("id,cargo_reference,checklist").eq("workspace_id",s.workspaceId).eq("id",draftId).eq("document_type","cte").maybeSingle(),
  db.from("fiscal_cte_transmissions").select("status,access_key,protocol").eq("workspace_id",s.workspaceId).eq("draft_id",draftId).maybeSingle(),
  db.from("fiscal_gmail_messages").select("message_id").eq("workspace_id",s.workspaceId).eq("draft_id",draftId).order("imported_at",{ascending:true}).limit(1).maybeSingle(),
  db.from("fiscal_cte_email_replies").select("status,gmail_sent_message_id,gmail_thread_id,recipient_email").eq("workspace_id",s.workspaceId).eq("draft_id",draftId).maybeSingle(),
 ]);
 return {s,db,draft,trans,source,existing};
}
export async function GET(req:Request){
 const id=new URL(req.url).searchParams.get("draftId")||"";
 if(!uuid.test(id))return NextResponse.json({error:"CT-e inválido."},{status:400});
 const data=await lookup(id);
 if(!data)return NextResponse.json({error:"Entre na Prime."},{status:401});
 const {draft,trans,source,existing}=data;
 if(!draft)return NextResponse.json({error:"CT-e não encontrado."},{status:404});
 return NextResponse.json({
  authorized:trans?.status==="authorized"&&/^\d{44}$/.test(trans.access_key||"")&&Boolean(trans.protocol),
  sourceLinked:Boolean(source?.message_id),existing:existing||null,
  cargoReference:draft.cargo_reference,accessKey:trans?.access_key||null,
  requiresGmailSendConsent:true,
  message:"O envio exige Gmail com permissão de envio, CT-e autorizado, XML oficial e confirmação.",
 },{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)
  return NextResponse.json({error:"Origem inválida."},{status:403});
 if(req.headers.get("x-prime-action")!=="ortobom-cte-email")
  return NextResponse.json({error:"Ação inválida."},{status:403});
 const body=await req.json().catch(()=>null) as {draftId?:unknown;confirmation?:unknown}|null;
 if(typeof body?.draftId!=="string"||!uuid.test(body.draftId)||body.confirmation!=="CONFIRMO ENVIO DO CT-E À ORTOBOM")
  return NextResponse.json({error:"Confirmação expressa necessária."},{status:400});
 const ctx=await lookup(body.draftId);
 if(!ctx)return NextResponse.json({error:"Login obrigatório."},{status:401});
 const {s,db,draft,trans,source,existing}=ctx;
 if(!draft||!s||!source?.message_id||!trans||trans.status!=="authorized"||
    !/^\d{44}$/.test(trans.access_key||"")||!trans.protocol)
  return NextResponse.json({error:"CT-e sem autorização confirmada ou sem e-mail de origem."},{status:409});
 if(existing)return NextResponse.json({error:"Já existe envio ou tentativa registrada para esse CT-e. Confira o Gmail antes de reenviar.",existing},{status:409});
 const token=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
 if(!token)return NextResponse.json({error:"Chave fiscal de produção ausente."},{status:503});
 // Obtain original authorized XML from provider. Fail closed on undocumented or incomplete responses.
 let xml="";
 try{
  // DotCompany transport documents use POST (not GET with query string).
  const result=await fetch("https://erp.dotcompany.com.br/api/v1/cte/documento",{
   method:"POST",
   headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json"},
   body:JSON.stringify({chave_acesso:trans.access_key,formato:"xml"}),
   cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!result.ok)throw Error("Documento fiscal indisponível (HTTP "+result.status+").");
  const obj=await result.json() as Record<string,unknown>;
  const nested=obj.documento&&typeof obj.documento==="object"&&!Array.isArray(obj.documento)
   ?obj.documento as Record<string,unknown>:{};
  const raw=typeof obj.xml==="string"?obj.xml:typeof nested.xml==="string"?nested.xml:"";
  const b64=[obj.xml_base64,obj.conteudo_base64,nested.xml_base64,nested.conteudo_base64]
   .find(value=>typeof value==="string");
  if(raw.trim().startsWith("<"))xml=raw;
  else if(typeof b64==="string"&&b64.length<3_000_000)
   xml=Buffer.from(b64,"base64").toString("utf8");
 }catch{}
 if(!xml||!xml.includes(trans.access_key)||!/<(?:[a-z0-9_]+:)?protCTe[\\s>]/i.test(xml)||!/<(?:[a-z0-9_]+:)?cStat>100<\\//i.test(xml))
  return NextResponse.json({error:"A DotCompany ainda não devolveu o XML autorizado em formato verificável. Nenhum e-mail foi enviado."},{status:409});
 const {data:claimed,error:claimError}=await db.from("fiscal_cte_email_replies").insert({
  workspace_id:s.workspaceId,draft_id:draft.id,source_message_id:source.message_id,
  recipient_email:"pending@ortobom.com.br",cte_access_key:trans.access_key,
  requested_by:s.userId,status:"sending",
 }).select("id").single();
 if(claimError||!claimed)return NextResponse.json({error:"Já existe tentativa de envio. Consulte o histórico."},{status:409});
 try{
  const sent=await sendAuthorizedCteReply({workspaceId:s.workspaceId,ownerId:s.userId,
   sourceMessageId:source.message_id,cteKey:trans.access_key,xml,
   cargoReference:String(draft.cargo_reference||"")});
  await db.from("fiscal_cte_email_replies").update({
   status:"sent",recipient_email:sent.recipient,gmail_sent_message_id:sent.messageId,
   gmail_thread_id:sent.threadId,updated_at:new Date().toISOString(),
  }).eq("id",claimed.id);
  return NextResponse.json({sent:true,recipient:sent.recipient,messageId:sent.messageId});
 }catch{
  await db.from("fiscal_cte_email_replies").update({
   status:"indeterminate",error_code:"SEND_UNCONFIRMED",updated_at:new Date().toISOString(),
  }).eq("id",claimed.id);
  return NextResponse.json({error:"Não foi possível confirmar o envio. Verifique a conversa original no Gmail antes de tentar novamente. Talvez seja necessário reconectar com permissão de envio."},{status:502});
 }
}
