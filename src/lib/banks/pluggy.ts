// Read-only Pluggy adapter. Never store bank passwords, connect tokens or API keys.
const BASE = "https://api.pluggy.ai";

export type PluggyItem = {
  id: string;
  clientUserId?: string | null;
  status?: string;
  executionStatus?: string;
  connector?: { name?: string };
};
export type PluggyAccount = {
  id: string; name?: string; marketingName?: string;
  type?: "BANK" | "CREDIT"; subtype?: string; number?: string;
  balance?: number | null; currencyCode?: string;
};
export type PluggyTransaction = {
  id: string; accountId?: string; date?: string; amount?: number;
  description?: string; descriptionRaw?: string; status?: string;
  type?: string; category?: string | null;
};
export function pluggyReady() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}
async function jsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Do not leak the provider response; it can contain private bank metadata.
    throw new Error("Pluggy API indisponível (HTTP " + response.status + ")");
  }
  return await response.json() as T;
}
async function request<T>(path: string, key: string, options?: RequestInit): Promise<T> {
  const url = new URL(path, BASE);
  if (url.origin !== BASE) throw new Error("Provedor inválido");
  const response=await fetch(url,{
    ...options,cache:"no-store",
    signal:AbortSignal.timeout(20000),
    headers:{"X-API-KEY":key,"Content-Type":"application/json",...options?.headers},
  });
  return jsonResponse<T>(response);
}
export async function pluggyApiKey(): Promise<string> {
  if (!pluggyReady()) throw new Error("Credenciais Pluggy não configuradas.");
  const response=await fetch(BASE+"/auth",{
    method:"POST",cache:"no-store",signal:AbortSignal.timeout(20000),
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      clientId:process.env.PLUGGY_CLIENT_ID,
      clientSecret:process.env.PLUGGY_CLIENT_SECRET,
    }),
  });
  const data=await jsonResponse<{apiKey?:string}>(response);
  if(!data.apiKey)throw new Error("A Pluggy não retornou credencial temporária.");
  return data.apiKey;
}
export async function pluggyConnectToken(key:string, userId:string) {
  const response=await request<{accessToken:string}>("/connect_token",key,{
    method:"POST",body:JSON.stringify({options:{clientUserId:userId}}),
  });
  if (!response.accessToken) throw new Error("Token de conexão indisponível.");
  return response.accessToken;
}
export async function pluggyItem(key:string,id:string):Promise<PluggyItem>{
  return request<PluggyItem>("/items/"+encodeURIComponent(id),key);
}
export async function pluggyAccounts(key:string,itemId:string):Promise<PluggyAccount[]> {
  const data=await request<{results?:PluggyAccount[]}>("/accounts?itemId="+encodeURIComponent(itemId),key);
  return Array.isArray(data.results)?data.results:[];
}
export async function pluggyTransactions(
  key:string,accountId:string,dateFrom:string,limitPages=12
):Promise<PluggyTransaction[]>{
  const items:PluggyTransaction[]=[];
  let path="/v2/transactions?accountId="+encodeURIComponent(accountId)+"&dateFrom="+encodeURIComponent(dateFrom);
  const seen=new Set<string>();
  for(let page=0;page<limitPages;page++){
    if(seen.has(path))throw new Error("Paginação repetida do provedor.");
    seen.add(path);
    const data=await request<{results?:PluggyTransaction[];next?:string|null}>(path,key);
    if(!Array.isArray(data.results))throw new Error("Extrato com formato inválido.");
    items.push(...data.results);
    if(!data.next) return items;
    if(!data.next.startsWith("?") || data.next.length>2000)throw new Error("Cursor de extrato inválido.");
    const params=new URLSearchParams(data.next.slice(1));
    if(params.get("accountId")!==accountId)throw new Error("Cursor pertence a outra conta.");
    path="/v2/transactions"+data.next;
  }
  throw new Error("Extrato extenso: reduza o período de importação.");
}
