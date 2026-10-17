import type {LedgerCargo} from "./simple-cargo-ledger.ts";

export type ManualBalanceReceipt={
 manual_settled_on:string|null;
 manual_settled_amount:number|string|null;
};
export type CargoWithReceipt=LedgerCargo&{
 paymentSource:"email"|"manual"|null;
 manualReceived:number;
};
/** Email do período tem prioridade; baixa manual nunca soma duas vezes o mesmo saldo. */
export function applyManualBalanceReceipt(cargo:LedgerCargo,receipt:ManualBalanceReceipt|null):CargoWithReceipt{
 if(cargo.status==="Pago")return {...cargo,paymentSource:"email",manualReceived:0};
 const entered=Number(receipt?.manual_settled_amount);
 const usable=Boolean(receipt?.manual_settled_on)&&Number.isFinite(entered)&&entered>0
   &&cargo.pending!==null&&cargo.freight!==null;
 if(!usable)return {...cargo,paymentSource:null,manualReceived:0};
 const manualReceived=Math.round(Math.min(entered,cargo.pending!)*100)/100;
 if(manualReceived===0)return {...cargo,paymentSource:null,manualReceived:0};
 const pending=Math.round(Math.max(0,cargo.pending!-manualReceived)*100)/100;
 return {...cargo,received:Math.round((cargo.received+manualReceived)*100)/100,pending,
  status:pending===0?"Pago":"Pendente",paymentSource:"manual",manualReceived};
}
