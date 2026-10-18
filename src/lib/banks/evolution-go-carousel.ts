import {firstBankButtons,extraBankButtons} from "./interactive-bank-buttons.ts";
/** Evolution Go NativeFlow carousel; legacy /send/button is rejected by some WhatsApp servers.
 * At least two cards with image headers; all actions stay bound to one outbox UUID.
 */
export function bankCarouselPayload(number:string,description:string,outboxId:string,
 more=false,imageUrl="https://raw.githubusercontent.com/guilhermerodriguesheik-boop/prime-group-app/main/public/prime-interactive-card.png"){
 const groups=[
  {title:"Classifique a movimentação",buttons:firstBankButtons(outboxId)},
  {title:"Outras áreas",buttons:extraBankButtons(outboxId)},
 ];
 if(more)groups.reverse();
 return {
  number,body:description.slice(0,280),footer:"Prime Finance · Classificação sem baixa",
  cards:groups.map(g=>({
   header:{title:g.title,imageUrl},body:{text:description.trim().slice(0,240)},
   footer:"Selecione a área desta movimentação",buttons:g.buttons.map(b=>({...b,type:"REPLY"}))
  }))
 };
}
