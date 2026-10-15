export type OrtobomEmailData = {
  cargoReference: string|null;
  freightValue: number|null;
  ciot: string|null;
  verifiedOrtobom: boolean;
};
function money(value:string):number|null{
  const cleaned=value.replace(/\s/g,"").replace(/\./g,"").replace(",",".");
  const number=Number(cleaned);
  return Number.isFinite(number)&&number>0&&number<100000000?Math.round(number*100)/100:null;
}
export function parseOrtobomEmail(subject:string,body:string):OrtobomEmailData{
  const cargo=subject.match(/arquivos\s+da\s+carga\s*[:#-]?\s*(\d{4,12})/i)
     || body.match(/arquivos\s+da\s+carga\s*[:#-]?\s*(\d{4,12})/i);
  const ciot=body.match(/\bCIOT\s*[:#-]?\s*(\d[\d.\s-]{9,16}\d)\b/i);
  const lines=body.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const leading=lines.slice(0,6).join(" ");
  const match=leading.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/) ||
      leading.match(/(?:^|\s)(\d{3,6},\d{2})(?:\s|$)/);
  const origin=/@ortobom\.com\.br\b/i.test(body);
  const parsedCiot=ciot?ciot[1].replace(/\D/g,""):null;
  return {
    cargoReference:cargo?.[1]||null,
    freightValue:match?money(match[1]):null,
    ciot:parsedCiot&&/^\d{11,12}$/.test(parsedCiot)?parsedCiot:null,
    verifiedOrtobom:origin,
  };
}
