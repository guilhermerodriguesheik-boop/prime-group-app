import { XMLParser } from "fast-xml-parser";

type Node = Record<string, unknown>;

function node(value: unknown): Node | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Node
    : null;
}

function field(parent: unknown, name: string): unknown {
  const obj = node(parent);
  if (!obj) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];
  const matching = Object.keys(obj).find((key) => key.endsWith(":" + name));
  return matching ? obj[matching] : undefined;
}

function value(parent: unknown, name: string): string {
  const found = field(parent, name);
  return found === undefined || found === null ? "" : String(found).trim();
}

function append(parts: string[], label: string, text: string) {
  if (text) parts.push(label + ": " + text.slice(0, 300));
}

// This is a supplement to the original XML, not a source of invented values.
export function summarizeFiscalXml(xml: string): string {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      parseTagValue: false,
      parseAttributeValue: false,
    });
    const root = parser.parse(xml) as unknown;

    const nfe = field(field(root, "nfeProc"), "NFe") ?? field(root, "NFe");
    const infNfe = field(nfe, "infNFe");
    if (infNfe) {
      const ide = field(infNfe, "ide");
      const emit = field(infNfe, "emit");
      const dest = field(infNfe, "dest");
      const total = field(field(infNfe, "total"), "ICMSTot");
      const summary = ["DOCUMENTO: NF-e (dados extraídos do XML; não comprova pagamento)"];
      const id = value(infNfe, "@Id").replace(/^NFe/, "");
      append(summary, "Chave", id || value(field(field(root, "nfeProc"), "protNFe"), "chNFe"));
      append(summary, "Número", value(ide, "nNF"));
      append(summary, "Série", value(ide, "serie"));
      append(summary, "Emissão", value(ide, "dhEmi") || value(ide, "dEmi"));
      append(summary, "Emitente", value(emit, "xNome"));
      append(summary, "CNPJ emitente", value(emit, "CNPJ"));
      append(summary, "Destinatário", value(dest, "xNome"));
      append(summary, "CNPJ/CPF destinatário", value(dest, "CNPJ") || value(dest, "CPF"));
      append(summary, "Valor total (R$)", value(total, "vNF"));

      const items = field(infNfe, "det");
      for (const item of (Array.isArray(items) ? items : items ? [items] : []).slice(0, 15)) {
        const prod = field(item, "prod");
        const product = value(prod, "xProd");
        if (product) summary.push("Produto: " + product.slice(0, 120)
          + " | q=" + value(prod, "qCom")
          + " | R$ " + value(prod, "vProd"));
      }
      return summary.join("\n");
    }

    const cte = field(field(root, "cteProc"), "CTe") ?? field(root, "CTe");
    const infCte = field(cte, "infCte");
    if (infCte) {
      const ide = field(infCte, "ide");
      const emit = field(infCte, "emit");
      const values = field(infCte, "vPrest");
      const summary = ["DOCUMENTO: CT-e (dados extraídos do XML; não comprova recebimento)"];
      append(summary, "Chave", value(infCte, "@Id").replace(/^CTe/, ""));
      append(summary, "Número", value(ide, "nCT"));
      append(summary, "Série", value(ide, "serie"));
      append(summary, "Emissão", value(ide, "dhEmi"));
      append(summary, "Emitente", value(emit, "xNome"));
      append(summary, "CNPJ emitente", value(emit, "CNPJ"));
      append(summary, "Valor total da prestação (R$)", value(values, "vTPrest"));
      return summary.join("\n");
    }

    return "";
  } catch {
    return "";
  }
}
