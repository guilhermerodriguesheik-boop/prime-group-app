import { XMLParser, XMLValidator } from "fast-xml-parser";

/** NF-e e uma fonte de dados da carga; nao e um CT-e nem prova o recebimento do frete. */
export type ImportedNfe = {
  accessKey: string;
  invoiceNumber: string;
  invoiceSeries: string;
  issuedAt: string | null;
  senderName: string;
  senderCnpj: string;
  recipientName: string;
  recipientCnpj: string;
  originCity: string;
  originUf: string;
  destinationCity: string;
  destinationUf: string;
  goodsValue: number;
  grossWeightKg: number | null;
  packageQuantity: number | null;
  cargoReference: string | null;
};
type Dict = Record<string, unknown>;
function obj(x: unknown): Dict {
  return x && typeof x === "object" && !Array.isArray(x) ? x as Dict : {};
}
function get(root: unknown, ...path: string[]): unknown {
  return path.reduce((parent, part) => {
    const record = obj(parent);
    const match = Object.keys(record).find((key) => key === part || key.endsWith(":" + part));
    return match ? record[match] : undefined;
  }, root);
}
function asText(x: unknown): string {
  return x === undefined || x === null ? "" : String(x).trim();
}
function asNumber(x: unknown): number | null {
  const text = asText(x);
  if (!text) return null;
  const result = Number(text);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
function digits(x: unknown): string { return asText(x).replace(/\D/g, ""); }

export function parseAuthorizedNfeXml(xml: string): ImportedNfe {
  if (!xml || new TextEncoder().encode(xml).byteLength > 1024 * 1024) {
    throw new Error("Envie um arquivo XML de NF-e de ate 1 MB.");
  }
  if (/<!(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new Error("XML com declaracao externa nao e aceito.");
  }
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error("O XML esta malformado.");
  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: "@",
    parseAttributeValue: false, parseTagValue: false,
    trimValues: true,
  });
  const root = parser.parse(xml) as Dict;
  const inf = get(root, "nfeProc", "NFe", "infNFe");
  const ide = get(inf, "ide");
  const emit = get(inf, "emit");
  const dest = get(inf, "dest");
  const protocol = get(root, "nfeProc", "protNFe", "infProt");
  const protocolCode = asText(get(protocol, "cStat"));
  if (!Object.keys(obj(inf)).length || protocolCode !== "100") {
    throw new Error("Apenas XML completo de NF-e autorizada (nfeProc, cStat 100) e aceito.");
  }
  const accessKey = asText(get(inf, "@_Id") ?? get(inf, "@Id")).replace(/^NFe/, "");
  if (!/^\d{44}$/.test(accessKey) || accessKey !== asText(get(protocol, "chNFe"))) {
    throw new Error("Chave de acesso da NF-e e protocolo nao conferem.");
  }
  const emitter = digits(get(emit, "CNPJ"));
  const recipient = digits(get(dest, "CNPJ") ?? get(dest, "CPF"));
  const goodsValue = asNumber(get(inf, "total", "ICMSTot", "vNF"));
  const number = asText(get(ide, "nNF"));
  if (emitter.length !== 14 || ![11,14].includes(recipient.length) || goodsValue === null || !number) {
    throw new Error("A NF-e nao possui dados fiscais essenciais.");
  }
  const volume = get(inf, "transp", "vol");
  const firstVolume = Array.isArray(volume) ? volume[0] : volume;
  const additionalInfo = asText(get(inf, "infAdic", "infAdFisco"))
    + " " + asText(get(inf, "infAdic", "infCpl"));
  const ref = additionalInfo.match(/\bCarga\s*:\s*(\d{3,15})\b/i);
  const emitted = asText(get(ide, "dhEmi"));
  return {
    accessKey, invoiceNumber: number,
    invoiceSeries: asText(get(ide, "serie")),
    issuedAt: emitted && !Number.isNaN(Date.parse(emitted)) ? new Date(emitted).toISOString() : null,
    senderName: asText(get(emit, "xNome")),
    senderCnpj: emitter,
    recipientName: asText(get(dest, "xNome")),
    recipientCnpj: recipient,
    originCity: asText(get(emit, "enderEmit", "xMun")),
    originUf: asText(get(emit, "enderEmit", "UF")),
    destinationCity: asText(get(dest, "enderDest", "xMun")),
    destinationUf: asText(get(dest, "enderDest", "UF")),
    goodsValue,
    grossWeightKg: asNumber(get(firstVolume, "pesoB")),
    packageQuantity: asNumber(get(firstVolume, "qVol")),
    cargoReference: ref ? ref[1] : null,
  };
}

/** A senha e o arquivo P12 nunca devem trafegar para a interface/IA/WhatsApp. */
