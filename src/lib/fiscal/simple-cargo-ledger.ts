/** Controle operacional por carga: um email de PAGAMENTO DE PERÍODO confirma o saldo informado.
 * Mensagens repetidas não representam novos adiantamentos ou pagamentos.
 * Não cruza extratos nem cria lançamentos bancários.
 */
export type LedgerDraft={cargo_reference:string|null;freight_value:number|string|null};
export type LedgerLine={cargo_reference:string;declared_freight:number|string|null;
 declared_advance:number|string|null;declared_balance:number|string|null};
export type LedgerEmail={event_kind:string;email_date:string|null;
 ortobom_financial_lines:LedgerLine[]|null};
export type LedgerCargo={cargo:string;freight:number|null;advance:number;
 received:number;pending:number|null;status:"Pago"|"Pendente"|"Adiantado"|"Sem valor"};
type Internal=LedgerCargo&{largestAdvance:number;periodAdvance:number|null;
 periodBalance:number|null;hasPayment:boolean};
function money(value:number|string|null|undefined):number|null{
 if(value===null||value===undefined||value==="")return null;
 const n=Number(value);
 return Number.isFinite(n)&&n>=0&&n<100_000_000?Math.round(n*100)/100:null;
}
function reference(value:string|null|undefined):string{
 const digits=(value||"").replace(/\D/g,"").replace(/^0+(?=\d)/,"");
 return digits.length>=4&&digits.length<=12?digits:"";
}
export function buildCargoLedger(drafts:LedgerDraft[],emails:LedgerEmail[]):LedgerCargo[]{
 const map=new Map<string,Internal>();
 function ensure(value:string|null|undefined):Internal|null{
  const id=reference(value);
  if(!id)return null;
  let row=map.get(id);
  if(!row){
   row={cargo:id.padStart(6,"0"),freight:null,advance:0,received:0,pending:null,
    status:"Sem valor",largestAdvance:0,periodAdvance:null,periodBalance:null,hasPayment:false};
   map.set(id,row);
  }
  return row;
 }
 for(const draft of drafts){
  const row=ensure(draft.cargo_reference);const value=money(draft.freight_value);
  if(row&&value!==null)row.freight=value;
 }
 // Email mais recente vence; repetições preservam o mesmo valor de cada carga.
 const sorted=[...emails].sort((a,b)=>(a.email_date||"").localeCompare(b.email_date||""));
 for(const email of sorted){
  for(const line of email.ortobom_financial_lines||[]){
   const row=ensure(line.cargo_reference);if(!row)continue;
   const freight=money(line.declared_freight);
   if(freight!==null)row.freight=freight;
   const advance=money(line.declared_advance);
   if(email.event_kind==="advance"&&advance!==null){
    // Muitos reencaminhamentos repetem o mesmo adiantamento. Não somar e-mails.
    row.largestAdvance=Math.max(row.largestAdvance,advance);
   }
   if(email.event_kind==="period_payment"){
    row.hasPayment=true;
    if(advance!==null)row.periodAdvance=advance;
    const paid=money(line.declared_balance);
    if(paid!==null)row.periodBalance=paid;
   }
  }
 }
 return [...map.values()].map(row=>{
  const advance=row.periodAdvance??row.largestAdvance;
  const total=row.freight;
  if(total===null)return {cargo:row.cargo,freight:null,advance,received:row.periodBalance??0,
   pending:null,status:"Sem valor" as const};
  const cappedAdvance=Math.min(total,advance);
  const remaining=Math.max(0,Math.round((total-cappedAdvance)*100)/100);
  // Quando chegou o e-mail de pagamento, considera o saldo quitado conforme
  // valor discriminado; quando a linha não apresenta saldo, usa frete - adiantamento.
  // O informe de "PAGAMENTO DE PERÍODO" é a baixa operacional definitiva
  // conforme regra informada pela Prime Group. Diferenças entre o valor indicado
  // e o restante calculado podem corresponder a descontos/acertos do período:
  // não geram pendências fictícias após o informe.
  const received=row.hasPayment?Math.min(remaining,row.periodBalance??remaining):0;
  const pending=row.hasPayment?0:remaining;
  const status:LedgerCargo["status"]=row.hasPayment?"Pago":
   pending>0.009?"Pendente":"Adiantado";
  return {cargo:row.cargo,freight:total,advance:cappedAdvance,received,pending,status};
 }).sort((a,b)=>{
  const aOpen=(a.pending??0)>0.009?1:0,bOpen=(b.pending??0)>0.009?1:0;
  return bOpen-aOpen||b.cargo.localeCompare(a.cargo);
 });
}
