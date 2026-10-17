export type CargoAmounts={driver_pay:number|string;driver_paid:boolean;helper_count:number;helper_rate:number|string;helpers_paid:boolean;diesel:number|string;tolls:number|string;other_expenses:number|string};
export const num=(v:number|string|null|undefined)=>Math.max(0,Number(v)||0);
export function cargoCosts(o:CargoAmounts|null|undefined,freight:number|null){
 const driver=num(o?.driver_pay),helpers=num(o?.helper_count)*num(o?.helper_rate);
 const other=num(o?.diesel)+num(o?.tolls)+num(o?.other_expenses);
 return {driver,helpers,other,total:driver+helpers+other,driverDue:o?.driver_paid?0:driver,helperDue:o?.helpers_paid?0:helpers,
 result:freight===null?null:freight-driver-helpers-other};
}