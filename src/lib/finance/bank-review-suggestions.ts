/** Read-only hints. Never settle a bill because its value resembles a bank movement. */
export type ReviewMovement={id:string;workspace_id:string;occurred_on:string;
 amount:number|string;direction:"credit"|"debit";description:string};
export type ReviewBill={id:string;workspace_id:string;description:string;
 amount:number|string;settled:number|string;status:string;kind:"payable"|"receivable";due_date:string};
export type ReviewRecurring={workspace_id:string;description:string;amount:number|string;
 due_day:number;frequency:string};
export type ReviewCargo={workspace_id:string;reference:string;date:string;amount:number};
const cents=(v:number|string)=>Math.round(Number(v)*100);
function closeDate(a:string,b:string,maxDays=7){
 const dayA=Date.parse(a+"T12:00:00Z"),dayB=Date.parse(b+"T12:00:00Z");
 return Number.isFinite(dayA)&&Number.isFinite(dayB)&&Math.abs(dayA-dayB)<=maxDays*86400000;
}
function dayDistance(day:number,due:number){
 return Math.min(Math.abs(day-due),Math.abs(day-due+31),Math.abs(day-due-31));
}
/** Indicative account movements are not necessarily operating revenue or cost. */
export function bankMovementNature(move:Pick<ReviewMovement,"description"|"direction">){
 const text=move.description.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
 if(move.direction==="debit"&&/(?:APL\s+APLIC|APLIC\s+AUT|APLICACAO)/.test(text))
  return {transfer:true,hint:"Possível aplicação financeira: transferência, não despesa operacional"};
 if(move.direction==="credit"&&/(?:RES\s+APLIC|RESGATE\s+APLIC)/.test(text))
  return {transfer:true,hint:"Possível resgate de aplicação: não receita operacional"};
 if(move.direction==="debit"&&/(?:PARCELA\s+GIRO|EMPRESTIMO)/.test(text))
  return {transfer:false,hint:"Possível parcela de crédito: conferir juros e amortização"};
 if(move.direction==="debit"&&/(?:TAR\/CUSTAS|TARIFA\s+BANC)/.test(text))
  return {transfer:false,hint:"Possível tarifa bancária"};
 if(move.direction==="debit"&&/DEBITO\s+SEGURO/.test(text))
  return {transfer:false,hint:"Possível despesa de seguro"};
 if(move.direction==="credit"&&/(?:SISPAG\s+IND|ORTOBOM)/.test(text))
  return {transfer:false,hint:"Possível recebimento de cliente: cruzar com cargas"};
 return {transfer:false,hint:null};
}
export function reviewSuggestions(move:ReviewMovement,bills:ReviewBill[],
 recurring:ReviewRecurring[],cargos:ReviewCargo[]){
 const amount=cents(move.amount);
 if(!Number.isSafeInteger(amount)||amount<=0)return [];
 const nature=bankMovementNature(move);
 // Bank investment transfers must not be suggested as settlement of invoices.
 if(nature.transfer)return [nature.hint];

 const direction=move.direction==="debit"?"payable":"receivable";
 const matchedBills=bills.filter(b=>b.workspace_id===move.workspace_id&&b.kind===direction
  &&!["cancelled","paid","received"].includes(b.status)
  &&cents(b.amount)-cents(b.settled)===amount
  &&closeDate(move.occurred_on,b.due_date));
 const candidates:string[]=nature.hint?[nature.hint]:[];
 if(matchedBills.length===1)candidates.push("Possível conta: "+matchedBills[0].description.slice(0,62));
 else if(matchedBills.length>1)candidates.push(matchedBills.length+" contas possíveis (valor e vencimento)");
 if(move.direction==="debit"){
  const dateDay=Number(move.occurred_on.slice(8,10));
  const recurringMatches=recurring.filter(r=>r.workspace_id===move.workspace_id
   &&r.frequency==="monthly"&&cents(r.amount)===amount
   &&Number.isInteger(dateDay)&&dayDistance(dateDay,Number(r.due_day))<=3);
  if(recurringMatches.length===1)candidates.push("Possível recorrência: "+recurringMatches[0].description.slice(0,56));
  else if(recurringMatches.length>1)candidates.push(recurringMatches.length+" recorrências possíveis");
 }
 if(move.direction==="credit"){
  const cargoMatches=cargos.filter(c=>c.workspace_id===move.workspace_id&&cents(c.amount)===amount
   &&closeDate(move.occurred_on,c.date));
  if(cargoMatches.length===1)candidates.push("Possível acerto Ortobom: "+cargoMatches[0].reference);
  else if(cargoMatches.length>1)candidates.push(cargoMatches.length+" acertos de carga possíveis");
 }
 return candidates.slice(0,3);
}
