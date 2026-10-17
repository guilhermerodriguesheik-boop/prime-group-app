export type SelectableCargo={
 cargo:string;freight:number|null;advance:number;received:number;pending:number|null;
 emailDate:string|null;
 operation:null|{service_date:string|null;route_description:string;driver_id:string|null;
  driver_pay:number|string;driver_paid:boolean;helper_count:number;helper_rate:number|string;
  helpers_paid:boolean;diesel:number|string;tolls:number|string;other_expenses:number|string};
};
const money=(v:number|string|null|undefined)=>Number(v)||0;
const round=(n:number)=>Math.round(n*100)/100;
const brl=(v:number)=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function selectedFreightTotals(rows:SelectableCargo[]){
 return rows.reduce((s,c)=>{
  const op=c.operation,driver=money(op?.driver_pay);
  const helpers=money(op?.helper_count)*money(op?.helper_rate);
  const extras=money(op?.diesel)+money(op?.tolls)+money(op?.other_expenses);
  return {count:s.count+1,freight:round(s.freight+money(c.freight)),advance:round(s.advance+c.advance),
   received:round(s.received+c.received),pending:round(s.pending+money(c.pending)),
   driverAgreed:round(s.driverAgreed+driver),
   driverDue:round(s.driverDue+(op?.driver_paid?0:driver)),
   helpersDue:round(s.helpersDue+(op?.helpers_paid?0:helpers)),
   costs:round(s.costs+driver+helpers+extras),
   estimatedResult:round(s.estimatedResult+(c.freight===null?0:c.freight-driver-helpers-extras)),
   missingFreight:s.missingFreight+(c.freight===null?1:0)};
 },{count:0,freight:0,advance:0,received:0,pending:0,driverAgreed:0,
  driverDue:0,helpersDue:0,costs:0,estimatedResult:0,missingFreight:0});
}
export function selectedDriverId(rows:SelectableCargo[]):string|null{
 if(!rows.length)return null;
 const id=rows[0].operation?.driver_id;
 return id&&rows.every(r=>r.operation?.driver_id===id&&money(r.operation?.driver_pay)>0)?id:null;
}
export function driverWhatsAppSummary(rows:SelectableCargo[],driverName:string){
 if(!selectedDriverId(rows))return null;
 const safeName=driverName.replace(/[\r\n]+/g," ").trim();
 const lines=rows.map(c=>{
  const o=c.operation!;
  const date=o.service_date||c.emailDate||"Sem data";
  const marker=o.service_date?"":" (data e-mail)";
  const route=o.route_description?.trim()? " | "+o.route_description.replace(/[\r\n]+/g," "):"";
  const amount=money(o.driver_pay);
  return "• "+date+marker+" | Carga "+c.cargo+route+" | "+brl(amount)+
   (o.driver_paid?" (marcado como pago)":" (a pagar)");
 });
 const total=selectedFreightTotals(rows);
 return "PRIME GROUP | FECHAMENTO DE FRETES\n"+
  "Motorista: "+safeName+"\n\n"+lines.join("\n")+"\n\n"+
  "Fretes: "+rows.length+"\nTotal combinado: "+brl(total.driverAgreed)+
  "\nJá marcado como pago: "+brl(total.driverAgreed-total.driverDue)+
  "\nTotal a pagar: "+brl(total.driverDue)+
  "\n\nDemonstrativo para conferência. Não é comprovante de pagamento.";
}
export function whatsappDraftLink(message:string,phone:string){
 const d=phone.replace(/\D/g,"");
 const number=d.length===10||d.length===11?"55"+d:d;
 if(d.length&& !/^55\d{10,11}$/.test(number))return null;
 return number? "https://wa.me/"+number+"?text="+encodeURIComponent(message):
  "https://api.whatsapp.com/send?text="+encodeURIComponent(message);
}
