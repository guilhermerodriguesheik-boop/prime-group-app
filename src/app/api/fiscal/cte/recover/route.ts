import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { session, gather } from "@/lib/fiscal/cte-data";
import { productionKey } from "@/lib/fiscal/cte-confirm";

export const runtime = "nodejs";
export const maxDuration = 60;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const existingAttemptWarning = "Já existe uma tentativa de transmissão para este rascunho.";
function admin() {
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!url || !key) throw Error("Backend fiscal indisponível.");
 return createClient(url, key, {auth:{autoRefreshToken:false,persistSession:false}});
}
function isObject(value:unknown):value is Record<string,unknown> {
 return value !== null && typeof value === "object" && !Array.isArray(value);
}
function errorText(value:unknown) {
 const row=isObject(value)?value:{};
 const candidates=[row.message,row.mensagem,row.detail,row.error,row.erro,row.errors,row.issues];
 const flattened=candidates.map(v=>{
  if(typeof v==="string")return v;
  if(Array.isArray(v))return JSON.stringify(v.slice(0,12));
  if(isObject(v))return JSON.stringify(v);
  return "";
 }).filter(Boolean).join(" | ");
 return flattened.replace(/dc_(?:live|test)_[A-Za-z0-9._-]+/g,"[REDACTED]").slice(0,1250);
}
/** Reuses the exact attempt idempotency key; NEVER resets/duplicates the fiscal record.
 * Triggered ONLY by human confirmation in the CT-e review modal.
 */
export async function POST(req:Request){
 const origin=req.headers.get("origin");
 if(origin && origin!==new URL(req.url).origin)
  return NextResponse.json({error:"Origem inválida."},{status:403});
 if(req.headers.get("x-prime-action")!=="fiscal-cte-idempotent-recover")
  return NextResponse.json({error:"Ação não autorizada."},{status:403});
 const body=await req.json().catch(()=>null) as {draftId?:unknown;confirmation?:unknown}|null;
 if(typeof body?.draftId!=="string"||!uuid.test(body.draftId)||
    body.confirmation!=="CONFIRMO REPETIR A MESMA TENTATIVA FISCAL")
  return NextResponse.json({error:"Confirmação explícita necessária."},{status:400});
 const s=await session();
 if(!s)return NextResponse.json({error:"Entre no Prime Finance como proprietário."},{status:401});
 const providerKey=process.env.DOTCOMPANY_PRODUCTION_API_KEY;
 if(!productionKey(providerKey)||process.env.DOTCOMPANY_CTE_LIVE_ENABLED!=="true")
  return NextResponse.json({error:"DotCompany produção não habilitada."},{status:503});
 const db=admin();
 const [{data:attempt,error:attemptError},gathered]=await Promise.all([
  db.from("fiscal_cte_transmissions")
   .select("id,workspace_id,draft_id,status,error_code,provider_response,payload_sha256,idempotency_key,updated_at")
   .eq("workspace_id",s.workspaceId).eq("draft_id",body.draftId).maybeSingle(),
  gather(s.workspaceId,s.db,body.draftId),
 ]);
 if(attemptError||!attempt||!gathered||gathered.draft.status!=="draft")
  return NextResponse.json({error:"Rascunho ou tentativa fiscal não disponível."},{status:404});
 if(attempt.status!=="indeterminate"||attempt.error_code!=="HTTP_422")
  return NextResponse.json({error:"A recuperação é permitida apenas para a tentativa HTTP 422 ainda inconclusiva."},{status:409});
 const previous=isObject(attempt.provider_response)?attempt.provider_response:{};
 const evidence=isObject(previous.reconciliation)?previous.reconciliation:{};
 if(evidence.cte_list_http_status!==200||evidence.emitter_profile_http_status!==200||
   (Array.isArray(evidence.possible_matches)&&evidence.possible_matches.length!==0))
  return NextResponse.json({error:"A consulta à DotCompany ainda não permite uma recuperação cautelosa."},{status:409});
 if(previous.replay)
  return NextResponse.json({error:"A tentativa de recuperação já foi iniciada; consulte o resultado antes de qualquer outra ação."},{status:409});
 const preview=gathered.preview;
 // Recompute exact persisted fiscal payload fingerprint. If anything was changed,
 // even metadata/weight/vehicle/cargo/CIOT, do not reuse a prior idempotency key.
 if(preview.hash!==attempt.payload_sha256 ||
  preview.missing.some(m=>!m.startsWith(existingAttemptWarning)))
  return NextResponse.json({error:"Os dados atuais divergem da tentativa original ou há outra pendência. Não é seguro reenviar.",missing:preview.missing},{status:409});
 const started=new Date().toISOString();
 const {data:claimed,error:claimError}=await db.from("fiscal_cte_transmissions")
  .update({provider_response:{...previous,replay:{state:"started",at:started}},
   updated_at:started})
  .eq("id",attempt.id).eq("workspace_id",s.workspaceId)
  .eq("status","indeterminate").eq("updated_at",attempt.updated_at)
  .select("id").maybeSingle();
 if(claimError||!claimed)
  return NextResponse.json({error:"Uma recuperação já está em andamento ou o registro mudou."},{status:409});
 let status="indeterminate",errorCode="REPLAY_RESULT_UNKNOWN",accessKey:string|null=null,protocol:string|null=null;
 let httpCode:number|null=null,details="";
 try{
  const result=await fetch("https://erp.dotcompany.com.br/api/v1/cte/criar-e-emitir",{
   method:"POST",
   headers:{Authorization:"Bearer "+providerKey,"Content-Type":"application/json",
    Accept:"application/json","Idempotency-Key":attempt.idempotency_key},
   body:JSON.stringify({...preview.payload,idempotency_key:attempt.idempotency_key}),
   cache:"no-store",signal:AbortSignal.timeout(24000),
  });
  httpCode=result.status;
  const raw=await result.text();
  const json=raw.length<100000?JSON.parse(raw) as unknown:null;
  const response=isObject(json)?json:{};
  details=errorText(response);
  if(result.ok && response.autorizado===true &&
    typeof response.chave_acesso==="string" && /^\d{44}$/.test(response.chave_acesso) &&
    typeof response.protocolo==="string" && response.protocolo.length>5){
   status="authorized";errorCode="";accessKey=response.chave_acesso;protocol=response.protocolo;
  }else if(result.status===422){
   status="rejected";errorCode="HTTP_422";
  }else if(result.ok && response.autorizado===false &&
     response.codigo_status_sefaz!==undefined){
   status="rejected";errorCode=String(response.codigo_status_sefaz).slice(0,32);
  }else{
   errorCode="HTTP_"+result.status+"_UNCONFIRMED";
  }
 }catch {
  errorCode="REPLAY_TIMEOUT_OR_UNREADABLE";
 }
 const completed=new Date().toISOString();
 const saved=await db.from("fiscal_cte_transmissions")
  .update({
   status, error_code:errorCode||null,
   access_key:accessKey,protocol,
   provider_response:{...previous,replay:{state:status,at:started,completed_at:completed,
    http_status:httpCode,reason:details||null,same_idempotency_key:true}},
   updated_at:completed,
  }).eq("id",attempt.id).eq("workspace_id",s.workspaceId)
  .eq("status","indeterminate").select("id").maybeSingle();
 if(saved.error||!saved.data)
  return NextResponse.json({error:"A API respondeu, mas não foi possível persistir a situação. Não tente novamente. Consulte o suporte técnico."},{status:502});
 return NextResponse.json({
  status,authorized:status==="authorized",accessKey,protocol,httpStatus:httpCode,
  reason:details||null,
  message:status==="authorized"?"CT-e autorizado. Chave e protocolo gravados.":
   status==="rejected"?"A DotCompany confirmou uma rejeição. Os detalhes foram registrados para corrigir o problema sem apagar o histórico.":
   "Resultado ainda inconclusivo; a tentativa permanece bloqueada.",
 },{headers:{"Cache-Control":"no-store"}});
}
