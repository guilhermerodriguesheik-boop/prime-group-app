export function Money({ value }: { value: number }) {
  return <>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)}</>;
}

export function Metric({ label, value, foot, tone }: { label: string; value: string; foot?: string; tone?: "positive"|"negative"|"warning" }) {
  return <div className="card"><div className="metric-label">{label}</div><div className={`metric-value ${tone ?? ""}`}>{value}</div>{foot && <div className="metric-foot">{foot}</div>}</div>;
}

export function Header({ title, subtitle }: { title: string; subtitle: string }) {
  const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date());
  return <div className="topbar"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="pills"><span className="pill">Dados reais</span><span className="pill">{date}</span></div></div>;
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return <div className="section-title"><h2>{title}</h2>{hint && <span>{hint}</span>}</div>;
}
