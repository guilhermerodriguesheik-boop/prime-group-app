/** Diagnóstico seguro: não expõe tokens, respostas OAuth nem detalhes do Supabase. */
export type GmailProblemCode="reconnect"|"oauth_client"|"configuration"|"permission"|"not_connected"|"temporarily_unavailable";
export type GmailProblem={code:GmailProblemCode;message:string};
export function diagnoseGmailFailure(cause:unknown):GmailProblem{
  const error=cause&&typeof cause==="object"?cause as {name?:string;code?:string;message?:string}:{};
  const value=error.message||"";
  if(error.code==="invalid_grant"||error.code==="missing_refresh"||
    /Google exige reconectar|Credencial inválida|unable to authenticate data|Gmail indisponível \(401\)/i.test(value))
    return {code:"reconnect",message:"A autorização do Gmail expirou ou foi revogada. Clique em Renovar conexão Google."};
  if(error.code==="invalid_client")
    return {code:"oauth_client",message:"O Google rejeitou as credenciais OAuth do servidor. Revise a configuração no painel da Vercel."};
  if(/Conecte o Gmail|Gmail não conectado|Conecte o Gmail da transportadora/i.test(value))
    return {code:"not_connected",message:"O Gmail ainda não foi autorizado. Clique em Conectar Gmail."};
  if(/Gmail indisponível \(403\)/i.test(value))
    return {code:"permission",message:"O Google negou acesso à caixa de entrada. Revise as permissões e renove a conexão."};
  if(/GMAIL_TOKEN_ENCRYPTION_KEY|Configurar Google OAuth|Backend Supabase indisponível/i.test(value))
    return {code:"configuration",message:"A integração Gmail precisa de configuração no servidor. Confira as variáveis do projeto na Vercel."};
  return {code:"temporarily_unavailable",message:"A sincronização falhou. Tente novamente; se persistir, confira a configuração e os logs do servidor."};
}
export type GmailHealthState="disconnected"|"reconnect"|"never_synced"|"stale"|"review"|"recent";
export function gmailConnectionHealth(input:{
  connected:boolean;lastCargoSync:string|null;lastFinancialSync:string|null;lastError:string|null;
},nowMs=Date.now()):GmailHealthState{
  if(!input.connected)return "disconnected";
  if(input.lastError&&/falha de conexão google|expirad|revogad|credenciais oauth|autorização do google/i.test(input.lastError))
    return "reconnect";
  const dates=[input.lastCargoSync,input.lastFinancialSync].map(value=>value?Date.parse(value):Number.NaN);
  if(dates.some(value=>!Number.isFinite(value)))return "never_synced";
  if(dates.some(value=>nowMs-value>36*60*60*1000||value>nowMs+5*60*1000))return "stale";
  return input.lastError?"review":"recent";
}
