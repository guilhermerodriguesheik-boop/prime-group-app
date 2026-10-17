import {firstBankButtons,extraBankButtons} from "@/lib/banks/interactive-bank-buttons";
/** Evolution Go NativeFlow carousel; legacy /send/button is rejected by some WhatsApp servers.
 * At least two cards with image headers; all actions stay bound to one outbox UUID.
 */
export function bankCarouselPayload(number:string,description:string,outboxId:string,
 more=false,imageUrl="https://prime-finance-ochre.vercel.app/api/banks/card-image"){
 const groups=[
  {title:"Classificação bancária",body:"Empresa ou Pessoal",buttons:firstBankButtons(outboxId)},
  {title:"Outras categorias",body:"Empréstimos, Transferência ou Pendente",buttons:extraBankButtons(outboxId)},
 ];
 if(more)groups.reverse();
 return {
  number,body:description.slice(0,280),footer:"Prime Finance · Classificação sem baixa",
  cards:groups.map(g=>({
   header:{title:g.title,imageUrl},body:g.body,
   footer:"Mesmo lançamento bancário",buttons:g.buttons.map(b=>({...b,type:"REPLY"}))
  }))
 };
}
