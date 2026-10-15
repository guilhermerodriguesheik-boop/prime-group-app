/** Dados extraídos de um e-mail da Ortobom. Não são confirmação de pagamento. */
export type OrtobomFreight = { cargoReference: string | null; ciot: string | null; freightValue: number | null };
export function parseOrtobomEmail(subject: string, body: string): OrtobomFreight {
  const cargo = subject.match(/arquivos\s+da\s+carga\s*([0-9]{5,12})/i)
    || body.match(/arquivos\s+da\s+carga\s*([0-9]{5,12})/i);
  // O campo CIOT pode conter 11 ou 12 algarismos, dependendo do comprovante.
  const ciot = body.match(/\bCIOT\s*[:#\-]?\s*(\d[\d.\s-]{9,16}\d)\b/i);
  const ciotDigits = ciot ? ciot[1].replace(/\D/g, "") : "";
  const amount = body.match(/(?:\bFRETE\b\s*[:=\-]?\s*)?R\$\s*([\d.]+,\d{2})/i)
    || body.match(/^\s*([\d.]+,\d{2})\s+CIOT\b/im);
  const value = amount ? Number(amount[1].replace(/\./g,"").replace(",",".")) : NaN;
  return {
    cargoReference: cargo ? cargo[1] : null,
    ciot: /^\d{11,12}$/.test(ciotDigits) ? ciotDigits : null,
    freightValue: Number.isFinite(value) && value > 0 && value < 1e9 ? value : null,
  };
}
export function isOrtobomSender(from: string): boolean {
  const match = from.match(/<([^>]+)>/)?.[1] || from.trim();
  return /^[^@\s]+@(?:[a-z0-9-]+\.)*ortobom\.com\.br$/i.test(match);
}
