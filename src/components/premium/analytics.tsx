import {TrendingUp,TrendingDown,Activity} from "lucide-react";
type Point={period:string;income:number;expense:number};
const brl=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(n);
export function PremiumTrend({points,title="Fluxo financeiro",subtitle}:{points:Point[];title?:string;subtitle?:string}){
 const max=Math.max(1,...points.flatMap(p=>[p.income,p.expense]));
 return <section className="card premium-chart-card">
  <div className="premium-chart-head"><div><div className="premium-eyebrow"><Activity size={13}/> INTELIGÊNCIA FINANCEIRA</div>
    <h3>{title}</h3><p className="metric-foot">{subtitle||"Receitas e despesas efetivamente lançadas no período"}</p></div>
   <div className="premium-legend"><span><i className="premium-legend-income"/> Receitas</span><span><i className="premium-legend-expense"/> Despesas</span></div>
  </div>
  <div className="premium-chart" role="img" aria-label={points.map(x=>x.period+": receitas "+brl(x.income)+", despesas "+brl(x.expense)).join("; ")}>
   {points.map((p,i)=><div className="premium-chart-col" key={p.period+"-"+i}>
    <div className="premium-chart-bars"><div className="premium-chart-track">
      <div className="premium-chart-bar income" style={{height:Math.max(p.income?3:0,Math.round(p.income/max*100))+"%"}} title={"Receitas "+brl(p.income)}/>
     </div><div className="premium-chart-track">
      <div className="premium-chart-bar expense" style={{height:Math.max(p.expense?3:0,Math.round(p.expense/max*100))+"%"}} title={"Despesas "+brl(p.expense)}/>
     </div></div>
    <span>{p.period}</span>
   </div>)}
  </div>
  <div className="premium-chart-footer"><span><TrendingUp size={15}/> Receitas no período: <strong>{brl(points.reduce((s,p)=>s+p.income,0))}</strong></span>
   <span><TrendingDown size={15}/> Despesas no período: <strong>{brl(points.reduce((s,p)=>s+p.expense,0))}</strong></span></div>
 </section>;
}
export function makeWeeklyTrend<T extends {occurred_at:string;type:string;amount:number;status:string;source:string;workspace_id:string}>(
 transactions:T[],allowed:Set<string>,count=6
):Point[]{
 const today=new Date(),start=new Date(today);
 const jsDay=start.getDay();start.setDate(start.getDate()-(jsDay+6)%7);start.setHours(0,0,0,0);
 const points:Point[]=[];
 for(let n=count-1;n>=0;n--){
  const from=new Date(start);from.setDate(start.getDate()-7*n);
  const until=new Date(from);until.setDate(from.getDate()+7);
  const records=transactions.filter(t=>allowed.has(t.workspace_id)&&["posted","reconciled"].includes(t.status)
   &&new Date(t.occurred_at)>=from&&new Date(t.occurred_at)<until);
  points.push({
   period:String(from.getDate()).padStart(2,"0")+"/"+String(from.getMonth()+1).padStart(2,"0"),
   income:records.filter(t=>t.type==="income"&&t.source!=="loan").reduce((s,t)=>s+Number(t.amount),0),
   expense:records.filter(t=>t.type==="expense"&&t.source!=="loan").reduce((s,t)=>s+Number(t.amount),0),
  });
 }
 return points;
}
export function PremiumExpenseList({transactions,ids}:{transactions:{description:string;type:string;amount:number;status:string;workspace_id:string}[];ids:Set<string>}){
 const group=new Map<string,number>();
 for(const t of transactions)if(ids.has(t.workspace_id)&&t.type==="expense"&&["posted","reconciled"].includes(t.status))
  group.set(t.description,(group.get(t.description)||0)+Number(t.amount));
 const rows=[...group.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
 const max=rows[0]?.[1]||1;
 return <section className="card premium-ranking"><div className="premium-eyebrow">ONDE O DINHEIRO SAI</div><h3>Maiores despesas registradas</h3>
  {rows.map(([description,value])=><div key={description} className="premium-expense-line"><div><span>{description}</span><strong>{brl(value)}</strong></div>
   <div className="premium-progress"><div style={{width:Math.round(value/max*100)+"%"}}/></div></div>)}
  {!rows.length&&<div className="bank-empty">Quando despesas forem registradas, a distribuição aparecerá aqui.</div>}
  <p className="metric-foot">Somente lançamentos registrados, não extratos ainda pendentes de conferência.</p>
 </section>;
}
