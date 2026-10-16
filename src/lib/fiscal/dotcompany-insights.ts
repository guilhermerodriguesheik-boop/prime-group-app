import "server-only";

/**
 * DotCompany production read-only access. No methods or paths are accepted from
 * the browser or from the AI; callers choose one of the operations below.
 * All requests remain server-side, bounded and never call emitir/cancelar.
 */
export type DotCompanyReadOperation = "usage" | "emitters" | "cte" | "mdfe" | "mdfe_pending";
type JsonMap = Record<string, unknown>;
type ReadResult = {
  operation: DotCompanyReadOperation;
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
  items: JsonMap[];
  summary: JsonMap;
};

const PROVIDER = "https://erp.dotcompany.com.br";
const ROUTES: Record<DotCompanyReadOperation, { path: string; method: "GET" | "POST" }> = {
  usage: { path: "/api/v1/usage", method: "GET" },
  emitters: { path: "/api/v1/emitters", method: "GET" },
  cte: { path: "/api/v1/cte/listar", method: "POST" },
  mdfe: { path: "/api/v1/mdfe/listar", method: "POST" },
  mdfe_pending: { path: "/api/v1/mdfe/pendentes-encerramento", method: "POST" },
};
const docFields = [
  "id", "cte_id", "mdfe_id", "numero", "number", "serie", "status", "situacao",
  "chave_acesso", "chave", "protocolo", "codigo_status_sefaz", "emitida_em",
  "data_emissao", "data_autorizacao", "idempotency_key", "cnpj_emitente",
  "tipo_documento", "mensagem", "message", "motivo", "uf_inicio", "uf_fim",
] as const;
const safeErrorFields = ["code", "error", "erro", "message", "mensagem", "detail", "details"];
function record(value: unknown): value is JsonMap {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 240);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
function sanitize(value: string) {
  return value
    .replace(/dc_(?:live|test)_[A-Za-z0-9._-]+/g, "[SEGREDO]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [SEGREDO]")
    .slice(0, 350);
}
function errorCode(status: number, payload: unknown): string {
  const found = record(payload)
    ? safeErrorFields.map(k => text(payload[k])).find(Boolean)
    : "";
  return sanitize(found || (status === 403 ? "Escopo de consulta não liberado." :
    status === 401 ? "A chave de produção não foi autenticada." :
    status === 404 || status === 405 ? "Endpoint de listagem não disponibilizado nesta versão da API." :
    status === 422 ? "A consulta foi rejeitada pelo provedor; conferir os parâmetros." :
    "DotCompany retornou HTTP " + status));
}
function pick(row: JsonMap) {
  const item: JsonMap = {};
  for (const key of docFields) {
    const val = row[key];
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      item[key] = sanitize(String(val));
    }
  }
  return item;
}
function entries(payload: unknown): JsonMap[] {
  if (Array.isArray(payload)) return payload.filter(record).slice(0, 30).map(pick);
  if (!record(payload)) return [];
  for (const candidate of ["items", "documentos", "registros", "ctes", "mdfes", "manifestos", "results", "data"]) {
    const value = payload[candidate];
    if (Array.isArray(value)) return value.filter(record).slice(0, 30).map(pick);
    if (record(value)) {
      const nested = entries(value);
      if (nested.length) return nested;
    }
  }
  return [];
}
function summary(payload: unknown, op: DotCompanyReadOperation): JsonMap {
  if (!record(payload)) return {};
  const result: JsonMap = {};
  const allowed = op === "usage"
    ? ["saldo", "creditos", "consumo", "chamadas", "total", "periodo"]
    : op === "emitters"
      ? ["total", "count", "message"]
      : ["total", "count", "quantidade", "message", "mensagem", "has_more", "pagina"];
  for (const key of allowed) {
    const val = payload[key];
    if (typeof val === "number" || typeof val === "string" || typeof val === "boolean") {
      result[key] = sanitize(String(val));
    }
    if (op === "usage" && key === "saldo" && record(val)) {
      result.saldo = Object.fromEntries(["disponivel", "disponível", "creditos", "saldo_atual"]
        .filter(k => typeof val[k] === "number" || typeof val[k] === "string")
        .map(k => [k, val[k]]));
    }
  }
  return result;
}
export async function readDotCompany(
  operation: DotCompanyReadOperation,
  fetcher: typeof fetch = fetch,
): Promise<ReadResult> {
  const base: ReadResult = { operation, ok: false, httpStatus: null, error: null, items: [], summary: {} };
  const token = process.env.DOTCOMPANY_PRODUCTION_API_KEY;
  if (!token || !/^dc_live_[A-Za-z0-9._-]{16,}$/.test(token)) {
    return { ...base, error: "Chave de produção DotCompany não configurada." };
  }
  const target = ROUTES[operation];
  if (!target) return { ...base, error: "Operação não permitida." };
  const call = (method: "GET" | "POST") => fetcher(PROVIDER + target.path, {
    method, headers: {
      "Authorization": "Bearer " + token, "Accept": "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(operation === "mdfe_pending" ? { dias: 3 } : {}) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  try {
    let res = await call(target.method);
    // Older platform deployments may implement listing with GET.
    if ((operation === "cte" || operation === "mdfe") && res.status === 405) res = await call("GET");
    const raw = await res.text();
    let value: unknown;
    try { value = JSON.parse(raw); } catch { value = null; }
    if (!res.ok) return { ...base, httpStatus: res.status, error: errorCode(res.status, value) };
    return {
      ...base, ok: true, httpStatus: res.status,
      items: entries(value), summary: summary(value, operation),
    };
  } catch {
    return { ...base, error: "Não foi possível acessar a DotCompany. A consulta não altera documentos." };
  }
}
