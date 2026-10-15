import Link from "next/link";
import { Header } from "@/components/ui";
const sections=[
 {name:"Prime Group",description:"Lançamentos, contas a pagar e recebíveis",href:"/prime"},
 {name:"Pessoal",description:"Movimentações e compromissos pessoais",href:"/pessoal"},
 {name:"Contas e cartões",description:"Contas bancárias internas, carteiras e cartões",href:"/contas"},
 {name:"Frota",description:"Cadastrar, editar e desativar veículos",href:"/frota"},
 {name:"Cadastro de transporte",description:"Motoristas, veículos e RNTRC/ANTT",href:"/cadastros/transporte"},
 {name:"Fretes e viagens",description:"Incluir e administrar viagens",href:"/viagens"},
 {name:"Empréstimos e juros",description:"Devedores, contratos e cobranças",href:"/juros"},
 {name:"Planejamento",description:"Lembretes, contas, recebíveis e recorrências",href:"/planejamento"},
];
export default function Page(){
 return <><Header title="Cadastros por área" subtitle="Cada seção agora tem seus próprios formulários e ações." />
 <div className="grid grid-2">{sections.map(item=><Link key={item.href} href={item.href} className="card record-directory"><h3>{item.name} →</h3><p className="metric-foot">{item.description}</p></Link>)}</div></>;
}
