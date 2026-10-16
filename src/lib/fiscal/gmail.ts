import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { parseAuthorizedNfeXml } from "@/lib/fiscal/nfe";
import { isOrtobomSender, parseOrtobomEmail } from "@/lib/fiscal/ortobom-email";
import { probeGoogleClient, type GoogleClientStatus } from "@/lib/fiscal/google-credential";
import { parseOrtobomFinancialEmail } from "@/lib/fiscal/ortobom-finance-parser";

export const GMAIL_ACCOUNT = "lgtransporteelogistica@gmail.com";
let clientStatusCache:{time:number;value:GoogleClientStatus}|null=null;
export async function gmailClientStatus():Promise<GoogleClientStatus>{
 if(clientStatusCache&&Date.now()-clientStatusCache.time<180_000)return clientStatusCache.value;
 const value=await probeGoogleClient(process.env.GOOGLE_GMAIL_CLIENT_ID,process.env.GOOGLE_GMAIL_CLIENT_SECRET);
 clientStatusCache={time:Date.now(),value};
 return value;
}
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export type GmailOAuthFailure = "invalid_client"|"invalid_grant"|"token_denied"|"missing_refresh"|"wrong_google_account"|"supabase_access"|"database_write"|"gmail_profile"|"session_or_workspace"|"unexpected";
export class GmailOAuthError extends Error {
  constructor(public readonly code:GmailOAuthFailure){super(code);this.name="GmailOAuthError";}
}

function admin(): SupabaseClient {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw Error("Backend Supabase indisponível.");
  return createAdminClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function encryptionKey(): Buffer {
  const key=process.env.GMAIL_TOKEN_ENCRYPTION_KEY||"";
  if(!/^[0-9a-f]{64}$/i.test(key)) throw Error("Configurar GMAIL_TOKEN_ENCRYPTION_KEY (64 dígitos hex).");
  return Buffer.from(key,"hex");
}
function encryptToken(clear:string):string {
  const iv=randomBytes(12), c=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const ciphertext=Buffer.concat([c.update(clear,"utf8"),c.final()]);
  return [iv,c.getAuthTag(),ciphertext].map(b=>b.toString("base64url")).join(".");
}
function decryptToken(value:string):string {
  const p=value.split(".");if(p.length!==3)throw Error("Credencial inválida.");
  const d=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(p[0],"base64url"));
  d.setAuthTag(Buffer.from(p[1],"base64url"));
  return Buffer.concat([d.update(Buffer.from(p[2],"base64url")),d.final()]).toString("utf8");
}
export function oauthConfig() {
  const clientId=process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret=process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  const origin=process.env.APP_BASE_URL;
  if(!clientId||!clientSecret||!origin||!origin.startsWith("https://"))
    throw Error("Configurar Google OAuth e APP_BASE_URL HTTPS.");
  return {clientId,clientSecret,redirectUri:new URL("/api/fiscal/gmail/callback",origin).toString()};
}
export async function ownerWorkspace() {
  const db=await createUserClient();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)throw Error("Faça login.");
  const {data:workspace,error:workspaceError}=await db.from("workspaces").select("id,owner_id")
    .eq("owner_id",user.id).eq("kind","prime").maybeSingle();
  if(workspaceError||!workspace)throw Error("A conexão Gmail só pode ser configurada pelo proprietário Prime.");
  return {workspaceId:workspace.id,ownerId:user.id};
}
export function googleAuthorizationUrl(state:string) {
  const {clientId,redirectUri}=oauthConfig();
  const params=new URLSearchParams({
    client_id:clientId,redirect_uri:redirectUri,response_type:"code",
    scope:GMAIL_SCOPE,access_type:"offline",prompt:"consent",
    login_hint:GMAIL_ACCOUNT,state,
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?"+params.toString();
}
type OAuthResponse={access_token?:string;refresh_token?:string;error?:string};
async function fetchOAuth(params:URLSearchParams):Promise<OAuthResponse>{
  const response=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:params,cache:"no-store",
  });
  const parsed=await response.json().catch(()=>null) as (OAuthResponse|{error?:string})|null;
  if(!response.ok){
    const code=parsed?.error;
    if(code==="invalid_client")throw new GmailOAuthError("invalid_client");
    if(code==="invalid_grant")throw new GmailOAuthError("invalid_grant");
    throw new GmailOAuthError("token_denied");
  }
  return (parsed||{}) as OAuthResponse;
}
export async function exchangeAuthorizationCode(code:string){
  const {clientId,clientSecret,redirectUri}=oauthConfig();
  const tokens=await fetchOAuth(new URLSearchParams({
    grant_type:"authorization_code",code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,
  }));
  if(!tokens.access_token||!tokens.refresh_token)throw new GmailOAuthError("missing_refresh");
  let profile:{emailAddress:string};
  try{profile=await gmailJson<{emailAddress:string}>(tokens.access_token,"/users/me/profile");}
  catch{throw new GmailOAuthError("gmail_profile");}
  if(profile.emailAddress?.toLowerCase()!==GMAIL_ACCOUNT)
    throw new GmailOAuthError("wrong_google_account");
  let workspaceId:string,ownerId:string;
  try{({workspaceId,ownerId}=await ownerWorkspace());}
  catch{throw new GmailOAuthError("session_or_workspace");}
  let database:SupabaseClient;
  try{database=admin();}catch{throw new GmailOAuthError("supabase_access");}
  const {error}=await database.from("fiscal_gmail_connections").upsert({
    workspace_id:workspaceId,owner_id:ownerId,email:GMAIL_ACCOUNT,
    encrypted_refresh_token:encryptToken(tokens.refresh_token),
    next_page_token:null,last_error:null,
  },{onConflict:"workspace_id"});
  if(error){
    console.error("Fiscal Gmail connection insert failed; Supabase error code:",error.code||"unknown");
    throw new GmailOAuthError("database_write");
  }
}
async function accessToken(encrypted:string){
  const {clientId,clientSecret}=oauthConfig();
  const tokens=await fetchOAuth(new URLSearchParams({
    grant_type:"refresh_token",refresh_token:decryptToken(encrypted),
    client_id:clientId,client_secret:clientSecret,
  }));
  if(!tokens.access_token)throw Error("Google exige reconectar a conta.");
  return tokens.access_token;
}
async function gmailJson<T>(token:string,path:string):Promise<T>{
  const res=await fetch("https://gmail.googleapis.com/gmail/v1"+path,{
    headers:{authorization:"Bearer "+token},cache:"no-store",
  });
  if(!res.ok)throw Error("Gmail indisponível ("+res.status+").");
  return res.json() as Promise<T>;
}
type GmailPart={mimeType?:string;filename?:string;body?:{data?:string;attachmentId?:string;size?:number};parts?:GmailPart[]};
type GmailMessage={id:string;labelIds?:string[];payload?:GmailPart&{headers?:Array<{name:string;value:string}>};snippet?:string};
function walk(p:GmailPart):GmailPart[] {return [p,...(p.parts||[]).flatMap(walk)];}
function decodeBase64(value:string):string {return Buffer.from(value,"base64url").toString("utf8");}
function header(message:GmailMessage,name:string){
  return message.payload?.headers?.find(x=>x.name.toLowerCase()===name.toLowerCase())?.value||"";
}
function mailBody(message:GmailMessage):string{
  const parts=message.payload?walk(message.payload):[];
  const plain=parts.find(x=>x.mimeType==="text/plain"&&x.body?.data);
  if(plain?.body?.data)return decodeBase64(plain.body.data);
  const html=parts.find(x=>x.mimeType==="text/html"&&x.body?.data);
  if(html?.body?.data)return decodeBase64(html.body.data).replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ");
  return message.snippet||"";
}
async function xmlAttachment(token:string,message:GmailMessage,part:GmailPart){
  if((part.body?.size||0)>1024*1024)throw Error("Anexo XML excede 1MB.");
  const raw=part.body?.data || (part.body?.attachmentId
    ? (await gmailJson<{data?:string}>(token,"/users/me/messages/"+encodeURIComponent(message.id)+
      "/attachments/"+encodeURIComponent(part.body.attachmentId))).data : "");
  if(!raw)throw Error("Anexo XML vazio.");
  const xml=decodeBase64(raw);
  if(Buffer.byteLength(xml,"utf8")>1024*1024)throw Error("Anexo XML excede 1MB.");
  return xml;
}
export type FiscalGmailSync={scanned:number;imported:number;invoices:number;skipped:number;errors:number};
async function importMessage(db:SupabaseClient,token:string,workspaceId:string,ownerId:string,msgId:string,requireInbox=false) {
  const {data:seen}=await db.from("fiscal_gmail_messages").select("id").eq("workspace_id",workspaceId)
    .eq("message_id",msgId).maybeSingle();
  if(seen)return {skipped:true,invoices:0};
  const message=await gmailJson<GmailMessage>(token,"/users/me/messages/"+encodeURIComponent(msgId)+"?format=full");
  if(requireInbox&&!message.labelIds?.includes("INBOX"))throw Error("O e-mail não está mais na caixa de entrada.");
  if(!isOrtobomSender(header(message,"from")))return {skipped:true,invoices:0};
  const xmlParts=message.payload?walk(message.payload).filter(p=>
    /\.xml$/i.test(p.filename||"")&&["application/xml","text/xml","application/octet-stream"].includes(p.mimeType||"")
  ):[];
  if(xmlParts.length===0)return {skipped:true,invoices:0};
  if(xmlParts.length>40)throw Error("E-mail com anexos demais para importação automática.");
  const freight=parseOrtobomEmail(header(message,"subject"),mailBody(message));
  // Sem valor/CIOT não se cria CT-e: XML da mercadoria não comprova valor de transporte.
  if(!freight.ciot||!freight.freightValue||!freight.cargoReference)
    throw Error("E-mail sem carga, CIOT ou valor do frete verificável.");
  const invoices: Array<{id:string;key:string}>=[];
  for(const part of xmlParts){
    const raw=await xmlAttachment(token,message,part);
    const parsed=parseAuthorizedNfeXml(raw);
    if(parsed.senderCnpj!=="14294395000278"||
       (parsed.cargoReference&&parsed.cargoReference!==freight.cargoReference))
      throw Error("NF-e não pertence à carga informada pela Ortobom.");
    const {data:row,error}=await db.from("fiscal_nfe_inbox").upsert({
      workspace_id:workspaceId,created_by:ownerId,source_kind:"gmail",source_id:msgId,
      access_key:parsed.accessKey,invoice_number:parsed.invoiceNumber,invoice_series:parsed.invoiceSeries,
      issued_at:parsed.issuedAt,sender_name:parsed.senderName,sender_cnpj:parsed.senderCnpj,
      recipient_name:parsed.recipientName,recipient_cnpj:parsed.recipientCnpj,
      origin_city:parsed.originCity,origin_uf:parsed.originUf,
      destination_city:parsed.destinationCity,destination_uf:parsed.destinationUf,
      goods_value:parsed.goodsValue,gross_weight_kg:parsed.grossWeightKg,
      package_quantity:parsed.packageQuantity,cargo_reference:freight.cargoReference,xml_content:raw,
    },{onConflict:"workspace_id,access_key",ignoreDuplicates:false}).select("id").single();
    if(error||!row)throw Error("Falha ao guardar NF-e da carga.");
    invoices.push({id:row.id,key:parsed.accessKey});
  }
  if(!invoices.length)return {skipped:true,invoices:0};
  const {data:previous}=await db.from("fiscal_drafts").select("id").eq("workspace_id",workspaceId)
    .eq("cargo_reference",freight.cargoReference).eq("document_type","cte")
    .neq("status","canceled").limit(1).maybeSingle();
  let draftId=previous?.id;
  if(!draftId){
    const {data:created,error}=await db.from("fiscal_drafts").insert({
      workspace_id:workspaceId,created_by:ownerId,document_type:"cte",nfe_id:invoices[0].id,
      cargo_reference:freight.cargoReference,ciot:freight.ciot,freight_value:freight.freightValue,status:"draft",
      checklist:{source:"ortobom_gmail",source_message_id:msgId,nfe_access_keys:invoices.map(x=>x.key),
        invoice_count:invoices.length,fiscal_approval:false,issue_environment:"none",
        note:"Dados sugeridos pelos anexos e corpo do e-mail. Conferir motorista, veículo, tomador, ANTT e tributação."},
    }).select("id").single();
    if(error||!created)throw Error("Falha ao criar rascunho CT-e.");
    draftId=created.id;
  }
  const {error:loggedError}=await db.from("fiscal_gmail_messages").upsert({
    workspace_id:workspaceId,message_id:msgId,cargo_reference:freight.cargoReference,
    ciot:freight.ciot,freight_value:freight.freightValue,nfe_count:invoices.length,draft_id:draftId,
  },{onConflict:"workspace_id,message_id"});
  if(loggedError)throw Error("Falha ao registrar idempotência do Gmail.");
  return {skipped:false,invoices:invoices.length};
}
export async function gmailStatus(workspaceId:string){
  const {data,error}=await admin().from("fiscal_gmail_connections").select("email,last_sync_at,last_error")
    .eq("workspace_id",workspaceId).maybeSingle();
  if(error)throw Error("Estado Gmail indisponível.");
  return data;
}
export async function syncGmailWorkspace(workspaceId:string,ownerId:string):Promise<FiscalGmailSync>{
  const db=admin();
  const {data:conn,error}=await db.from("fiscal_gmail_connections").select("*")
    .eq("workspace_id",workspaceId).eq("owner_id",ownerId).maybeSingle();
  if(error||!conn)throw Error("Conecte o Gmail da transportadora primeiro.");
  const stats:FiscalGmailSync={scanned:0,imported:0,invoices:0,skipped:0,errors:0};
  try{
    const token=await accessToken(conn.encrypted_refresh_token);
    const query=new URLSearchParams({
      q:"from:acertorj.qm@ortobom.com.br filename:xml",
      maxResults:"8",
    });
    if(conn.next_page_token)query.set("pageToken",conn.next_page_token);
    const list=await gmailJson<{messages?:Array<{id:string}>;nextPageToken?:string}>(token,
      "/users/me/messages?"+query.toString());
    for(const m of list.messages||[]){
      stats.scanned++;
      try {
        const result=await importMessage(db,token,workspaceId,ownerId,m.id);
        if(result.skipped)stats.skipped++;
        else{stats.imported++;stats.invoices+=result.invoices;}
      }catch{stats.errors++;}
    }
    // Ao chegar ao fim, voltar à primeira página para coletar novos e-mails.
    await db.from("fiscal_gmail_connections").update({
      next_page_token:list.nextPageToken||null,last_sync_at:new Date().toISOString(),
      last_error:stats.errors?stats.errors+" e-mail(s) necessitam conferência manual":null,
    }).eq("workspace_id",workspaceId);
    return stats;
  }catch{
    await db.from("fiscal_gmail_connections").update({last_error:"Falha de conexão Google. Reconecte se necessário."})
      .eq("workspace_id",workspaceId);
    throw Error("Não foi possível sincronizar o Gmail da Ortobom.");
  }
}
export async function syncAllGmailWorkspaces(){
  const {data,error}=await admin().from("fiscal_gmail_connections").select("workspace_id,owner_id").limit(15);
  if(error)throw Error("Conexões Gmail indisponíveis.");
  const result=[];for(const item of data||[]){
    try{
      const cargos=await syncGmailWorkspace(item.workspace_id,item.owner_id);
      let finance:FinancialGmailSync|{error:string};
      try{finance=await syncOrtobomFinancialReports(item.workspace_id,item.owner_id);}
      catch{finance={error:"finance_sync_failed"};}
      result.push({workspace_id:item.workspace_id,...cargos,finance});
    }catch{result.push({workspace_id:item.workspace_id,error:"sync_failed"});}
  }return result;
}

/** Listagem manual: somente metadados de e-mails reais do Gmail da Ortobom,
 * sem expor corpos, anexos ou tokens OAuth ao navegador. */
export type FiscalInboxItem={
 id:string;from:string;subject:string;date:string;snippet:string;imported:boolean;
};
async function gmailConnection(workspaceId:string,ownerId:string){
 const db=admin();
 const {data:conn,error}=await db.from("fiscal_gmail_connections")
  .select("encrypted_refresh_token").eq("workspace_id",workspaceId).eq("owner_id",ownerId).maybeSingle();
 if(error||!conn)throw Error("Conecte o Gmail da Ortobom primeiro.");
 return {db,token:await accessToken(conn.encrypted_refresh_token)};
}
export async function listOrtobomInbox(workspaceId:string,ownerId:string):Promise<FiscalInboxItem[]>{
 const {db,token}=await gmailConnection(workspaceId,ownerId);
 const q=new URLSearchParams({q:"in:inbox from:ortobom.com.br",maxResults:"20"});
 const data=await gmailJson<{messages?:Array<{id:string}>}>(token,"/users/me/messages?"+q.toString());
 const mailIds=(data.messages||[]).map(x=>x.id).filter(id=>/^[a-zA-Z0-9_-]{8,40}$/.test(id));
 if(!mailIds.length)return [];
 const {data:seen,error}=await db.from("fiscal_gmail_messages").select("message_id")
  .eq("workspace_id",workspaceId).in("message_id",mailIds);
 if(error)throw Error("Não foi possível conferir as importações anteriores.");
 const already=new Set((seen||[]).map(x=>x.message_id));
 const batches=await Promise.allSettled(mailIds.map(async id=>{
  const p=new URLSearchParams({format:"metadata"});
  for(const name of ["From","Subject","Date"])p.append("metadataHeaders",name);
  const mail=await gmailJson<GmailMessage>(token,"/users/me/messages/"+encodeURIComponent(id)+"?"+p);
  if(!isOrtobomSender(header(mail,"From"))||!mail.labelIds?.includes("INBOX"))return null;
  return {
   id,from:header(mail,"From").slice(0,180),subject:header(mail,"Subject").slice(0,300),
   date:header(mail,"Date").slice(0,120),snippet:(mail.snippet||"").slice(0,280),
   imported:already.has(id),
  } satisfies FiscalInboxItem;
 }));
 return batches.filter((v):v is PromiseFulfilledResult<FiscalInboxItem|null>=>v.status==="fulfilled")
  .map(v=>v.value).filter((v):v is FiscalInboxItem=>v!==null);
}
export async function importSelectedOrtobomInbox(workspaceId:string,ownerId:string,ids:string[]):Promise<FiscalGmailSync>{
 if(!Array.isArray(ids)||ids.length<1||ids.length>8||new Set(ids).size!==ids.length||
    ids.some(id=>typeof id!=="string"||!/^[a-zA-Z0-9_-]{8,40}$/.test(id)))
  throw Error("Selecione entre 1 e 8 e-mails válidos.");
 const {db,token}=await gmailConnection(workspaceId,ownerId);
 const result:FiscalGmailSync={scanned:0,imported:0,invoices:0,skipped:0,errors:0};
 for(const id of ids){
  result.scanned++;
  try{
   const imported=await importMessage(db,token,workspaceId,ownerId,id,true);
   if(imported.skipped)result.skipped++;
   else{result.imported++;result.invoices+=imported.invoices;}
  }catch{result.errors++;}
 }
 return result;
}

export type FinancialGmailSync={scanned:number;imported:number;skipped:number;errors:number;hasMore:boolean};
export async function syncOrtobomFinancialReports(workspaceId:string,ownerId:string):Promise<FinancialGmailSync>{
 const db=admin();
 const {data:conn,error}=await db.from("fiscal_gmail_connections")
  .select("encrypted_refresh_token,financial_next_page_token")
  .eq("workspace_id",workspaceId).eq("owner_id",ownerId).maybeSingle();
 if(error||!conn)throw Error("Gmail não conectado.");
 const token=await accessToken(conn.encrypted_refresh_token);
 const p=new URLSearchParams({q:"from:ortobom.com.br {subject:ADIANTAMENTO subject:PAGAMENTO} after:2026/01/01",maxResults:"30"});
 if(conn.financial_next_page_token)p.set("pageToken",conn.financial_next_page_token);
 const page=await gmailJson<{messages?:Array<{id:string}>;nextPageToken?:string}>(token,"/users/me/messages?"+p);
 const ids=(page.messages||[]).map(x=>x.id).filter(x=>/^[A-Za-z0-9_-]{8,40}$/.test(x));
 const knownResponse=ids.length?await db.from("ortobom_financial_emails").select("message_id")
  .eq("workspace_id",workspaceId).in("message_id",ids):{data:[],error:null};
 if(knownResponse.error)throw Error("Falha ao consultar relatórios anteriores.");
 const known=new Set((knownResponse.data||[]).map(x=>x.message_id));
 const stats:FinancialGmailSync={scanned:0,imported:0,skipped:0,errors:0,hasMore:!!page.nextPageToken};
 for(const id of ids){
  stats.scanned++;
  if(known.has(id)){stats.skipped++;continue;}
  try{
   const mail=await gmailJson<GmailMessage>(token,"/users/me/messages/"+encodeURIComponent(id)+"?format=full");
   const sender=header(mail,"from");
   if(!isOrtobomSender(sender)){stats.skipped++;continue;}
   const extracted=parseOrtobomFinancialEmail(header(mail,"subject"),mailBody(mail));
   if(!extracted){stats.skipped++;continue;}
   const mailDate=new Date(header(mail,"date"));
   const {data:record,error:saveError}=await db.from("ortobom_financial_emails").upsert({
    workspace_id:workspaceId,message_id:id,event_kind:extracted.kind,
    subject:extracted.subject,sender:sender.slice(0,300),
    email_date:Number.isNaN(mailDate.getTime())?null:mailDate.toISOString(),
    payment_date:extracted.paymentDate,period_start:extracted.periodStart,period_end:extracted.periodEnd,
    declared_bank_deposit:extracted.declaredBankDeposit,
    declared_promissory_discount:extracted.declaredPromissoryDiscount,
   },{onConflict:"workspace_id,message_id",ignoreDuplicates:true}).select("id").maybeSingle();
   if(saveError)throw Error("Não foi possível registrar o e-mail financeiro.");
   if(!record){stats.skipped++;continue;}
   if(extracted.lines.length){
    const {error:linesError}=await db.from("ortobom_financial_lines").upsert(extracted.lines.map((line,i)=>({
     email_id:record.id,line_number:i,cargo_reference:line.cargoReference,
     cte_number:line.cteNumber,declared_freight:line.freight,
     declared_advance:line.advance,declared_balance:line.balance,
    })),{onConflict:"email_id,line_number"});
    if(linesError)throw Error("Não foi possível registrar as cargas do relatório.");
   }
   stats.imported++;
  }catch{stats.errors++;}
 }
 const {error:cursorError}=await db.from("fiscal_gmail_connections").update({
  financial_next_page_token:page.nextPageToken||null,financial_last_sync_at:new Date().toISOString(),
 }).eq("workspace_id",workspaceId).eq("owner_id",ownerId);
 if(cursorError)throw Error("Não foi possível registrar o avanço na caixa de entrada.");
 return stats;
}
