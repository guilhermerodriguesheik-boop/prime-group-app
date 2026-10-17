export type BankButtonAction="E"|"P"|"M"|"I"|"T"|"U";
export const BANK_BUTTON_ID=/^pb1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([EPMITU])$/;
export function bankButtonId(outboxId:string,action:BankButtonAction){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(outboxId))
  throw new Error("Invalid bank message reference");
 return "pb1."+outboxId.toLowerCase()+"."+action;
}
export function readBankButtonId(raw:unknown){
 if(typeof raw!=="string")return null;
 const match=raw.match(BANK_BUTTON_ID);
 return match?{outboxId:match[1],action:match[2] as BankButtonAction}:null;
}
export const firstBankButtons=(id:string)=>[
 {type:"reply",displayText:"Empresa",id:bankButtonId(id,"E")},
 {type:"reply",displayText:"Pessoal",id:bankButtonId(id,"P")},
 {type:"reply",displayText:"Mais opções",id:bankButtonId(id,"M")},
];
export const extraBankButtons=(id:string)=>[
 {type:"reply",displayText:"Empréstimos",id:bankButtonId(id,"I")},
 {type:"reply",displayText:"Transferência",id:bankButtonId(id,"T")},
 {type:"reply",displayText:"Pendente",id:bankButtonId(id,"U")},
];
