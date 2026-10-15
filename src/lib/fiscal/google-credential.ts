/**
 * Verificação sem consentimento: um refresh_token propositalmente inválido é enviado
 * à API oficial; invalid_grant indica credencial OAuth aceita, invalid_client indica
 * rejeição do par client_id/client_secret. Nenhum token real ou dado Gmail é utilizado.
 */
export type GoogleClientStatus="accepted"|"rejected"|"not_configured"|"unknown";
export async function probeGoogleClient(
 clientId:string|undefined,clientSecret:string|undefined,fetcher:typeof fetch=fetch,
):Promise<GoogleClientStatus>{
 if(!clientId?.trim()||!clientSecret?.trim())return "not_configured";
 try{
  const response=await fetcher("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      client_id:clientId.trim(),client_secret:clientSecret.trim(),
      grant_type:"refresh_token",refresh_token:"prime-finance-invalid-credential-diagnostic"
    }),
    cache:"no-store",signal:AbortSignal.timeout(7000),
  });
  const data=await response.json().catch(()=>null) as {error?:string}|null;
  if(data?.error==="invalid_client")return "rejected";
  if(data?.error==="invalid_grant")return "accepted";
  return "unknown";
 }catch{return "unknown";}
}
