/** Pure read-only parser of the two documented Ortobom email formats.
 * Monetary values here are CLAIMS in email, not cleared bank transactions.
 */
export type OrtobomFinanceKind="advance"|"period_payment";
export type OrtobomFinanceLine={
 cargoReference:string;cteNumber:string|null;freight:number|null;
 advance:number|null;balance:number|null;
};
export type ParsedOrtobomFinance={
 kind:OrtobomFinanceKind;subject:string;paymentDate:string|null;
 periodStart:string|null;periodEnd:string|null;
 declaredBankDeposit:number|null;declaredPromissoryDiscount:number|null;
 lines:OrtobomFinanceLine[];
};
function money(s:string|undefined):number|null{
 if(!s)return null;
 const v=s.trim().replace(/[^\d,.-]/g,"");
 if(!v)return null;
 const num=Number(v.includes(",")?v.replace(/\./g,"").replace(",","."):v);
 return Number.isFinite(num)&&num>=0&&num<100_000_000?Math.round(num*100)/100:null;
}
export function canonicalCargo(value:string):string{
 const digits=value.replace(/\D/g,"");
 return digits.replace(/^0+(?=\d)/,"");
}
function isoDate(s:string|undefined):string|null{
 if(!s)return null;
 const m=s.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
 if(!m)return null;
 const year=m[3].length===2?"20"+m[3]:m[3];
 const val=year+"-"+m[2]+"-"+m[1];
 const date=new Date(val+"T12:00:00Z");
 return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==val?null:val;
}
/** Ignore quoted/forwarded content: forwarded previous advances must not become new events. */
function newContent(body:string):string{
 const lines=body.replace(/\r/g,"").split("\n");
 const boundary=lines.findIndex((line,index)=>index>0&&
  /^(?:\s*De:\s|\s*From:\s|\s*-----\s*Mensagem Original\s*-----|\s*---------- Forwarded message)/i.test(line));
 return lines.slice(0,boundary<0?undefined:boundary).join("\n").slice(0,16000);
}
export function parseOrtobomFinancialEmail(subject:string,body:string):ParsedOrtobomFinance|null{
 const sub=subject.trim();
 const kind:OrtobomFinanceKind|null=
  /^ADIANTAMENTO\b/i.test(sub)?"advance":
  /^PAGAMENTO\s+DE\s+PER[IÍ]ODO\b/i.test(sub)?"period_payment":null;
 if(!kind)return null;
 const clean=newContent(body);
 const paymentDate=isoDate(clean.match(/DATA\s+DO\s+PAGAMENTO\s*:\s*(\d{2}\/\d{2}\/\d{2,4})/i)?.[1]);
 const dates=clean.match(/PER[IÍ]ODO\s*:\s*(\d{2}\/\d{2}\/\d{2,4})\s*(?:a|até|-)\s*(\d{2}\/\d{2}\/\d{2,4})/i);
 const deposit=money(clean.match(/VALOR\s+DO\s+DEP[OÓ]SITO(?:\s+BANC[AÁ]RIO)?\s*:\s*R?\$?\s*([\d.,]+)/i)?.[1]);
 const promissory=money(clean.match(/NOTA\s+PROMISS[OÓ]RIA\s*:\s*-?\s*R?\$?\s*([\d.,]+)/i)?.[1]);
 const lines:OrtobomFinanceLine[]=[];
 for(const original of clean.split("\n")){
  const line=original.replace(/\s+/g," ").trim();
  if(!line||/^(?:CARGA|TRANSPORTADORA|TOTAL|SOMA|VALOR|DATA|PER[IÍ]ODO|PRIME GROUP\s*$)/i.test(line))continue;
  if(kind==="advance"){
   const m=line.match(/^0*(\d{4,7})\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)(?:\s|$)/i);
   if(m){
    const freight=money(m[2]),advance=money(m[3]);
    if(freight===null||advance===null||advance>freight)continue;
    lines.push({cargoReference:canonicalCargo(m[1]),cteNumber:null,freight,advance,balance:null});
   }
  }else{
   // CTE + CARGA + FRETE + ADIANTAMENTO + SALDO. The CT-e column can be absent.
   const s=line.replace(/^PRIME\s+GROUP\s+/i,"");
   const m=s.match(/^(?:(\d{1,4})\s+)?0*(\d{4,7})\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/i);
   if(m){
    lines.push({cargoReference:canonicalCargo(m[2]),cteNumber:m[1]||null,
      freight:money(m[3]),advance:money(m[4]),balance:money(m[5])});
   }else{
    const m2=s.match(/^0*(\d{4,7})\s+R\$\s*([\d.,]+)(?:\s|$)/i);
    if(m2)lines.push({cargoReference:canonicalCargo(m2[1]),cteNumber:null,
     freight:money(m2[2]),advance:null,balance:null});
   }
  }
 }
 const dedup=[...new Map(lines.map(x=>[x.cargoReference,x])).values()];
 if(!dedup.length&&!deposit)return null;
 return {kind,subject:sub.slice(0,300),paymentDate,periodStart:isoDate(dates?.[1]),
  periodEnd:isoDate(dates?.[2]),declaredBankDeposit:deposit,
  declaredPromissoryDiscount:promissory,lines:dedup};
}