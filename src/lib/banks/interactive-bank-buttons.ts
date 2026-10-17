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

export function parseEvolutionBankButtonClick(data:unknown){
 if(!data||typeof data!=="object"||Array.isArray(data))return null;
 const d=data as Record<string,unknown>;
 const ref=readBankButtonId(d.buttonId);
 if(!ref||d.fromMe===true)return null;
 const jid=typeof d.jid==="string"?d.jid:"";
 const number=typeof d.phone==="string"?d.phone.replace(/\D/g,""):"";
 const messageId=typeof d.messageId==="string"?d.messageId:"";
 if(!/^[0-9]{10,15}@s\.whatsapp\.net$/.test(jid))return null;
 if(number!==jid.split("@")[0]||!/^[a-zA-Z0-9_-]{8,150}$/.test(messageId))return null;
 return {sender:number,messageId,buttonId:d.buttonId as string,reference:ref};
}

/**
 * Evolution Go v1 also delivers carousel quick replies as ordinary "message"
 * webhooks (templateButtonReplyMessage), not only "ButtonClick" events.
 * Never interpret a manually typed button ID as a verified button click.
 */
export function readEvolutionGoBankReply(message:unknown):string|null {
 if(!message||typeof message!=="object"||Array.isArray(message))return null;
 const m=message as Record<string,unknown>;
 const template=m.templateButtonReplyMessage;
 const buttons=m.buttonsResponseMessage;
 const toObject=(value:unknown):Record<string,unknown> =>
  value&&typeof value==="object"&&!Array.isArray(value) ? value as Record<string,unknown> : {};
 const first=toObject(template).selectedID;
 const second=toObject(buttons).selectedButtonId;
 const candidate=typeof first==="string"?first:typeof second==="string"?second:null;
 return readBankButtonId(candidate)?candidate:null;
}
