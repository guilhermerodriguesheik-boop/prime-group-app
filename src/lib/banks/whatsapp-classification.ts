/** Safe interpretation of one movement number from the most recently DELIVERED WhatsApp bank report.
 * Does not settle payments, create cash transactions or guess a workspace from an unqualified expense.
 */
export type BankArea="prime"|"personal"|"interest"|"transfer"|"pending";
export type BankNumberClassification={
 number:number;destination:BankArea;category:string;
};
export type BankNumberRequest=
 |{type:"classification";classification:BankNumberClassification}
 |{type:"clarify";number:number;category:string};
const strip=(x:string)=>x.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const normalizeSpace=(x:string)=>x.replace(/\s+/g," ").trim();

export function parseWhatsAppBankNumber(raw:string):BankNumberRequest|null{
 const text=normalizeSpace(raw);
 if(text.length>135)return null;
 const match=text.match(/^(?:(?:classificar|classifica|classifique|categoria|movimento|lan[cç]amento)\s+)?#?(\d{1,2})\s*(?:[:=\-]\s*)?(.+)$/i);
 if(!match)return null;
 const number=Number(match[1]);
 if(!Number.isInteger(number)||number<1||number>22)return null;
 const original=normalizeSpace(match[2]).replace(/^(?:como|em|na|no)\s+/i,"");
 if(!original||original.length>80)return null;
 const label=strip(original);
 let destination:BankArea|null=null;
 const personal=/^(?:pessoal|casa|familia|familiares|pf)(?:\b|$)/.test(label);
 const prime=/^(?:prime|empresa|empresarial|pj)(?:\b|$)/.test(label);
 const interest=/^(?:emprestimo|emprestimos|juros|financiamento|parcela giro|capital de giro)(?:\b|$)/.test(label);
 const transfer=/^(?:transferencia|transferir|aplicacao|aplicacoes|resgate|investimento|investimentos)(?:\b|$)/.test(label);
 const pending=/^(?:pendente|nao classificado|deixar pendente|revisar)(?:\b|$)/.test(label);
 if(personal)destination="personal";
 else if(prime)destination="prime";
 else if(interest)destination="interest";
 else if(transfer)destination="transfer";
 else if(pending)destination="pending";
 else if(/^(?:tarifa|taxa bancaria|custas bancarias|seguro|diesel|combustivel|pedagio|frete|recebimento|ortobom|motorista|ajudante|manutencao|imposto)(?:\b|$)/.test(label))destination="prime";
 if(!destination){
  const explicit=/^(?:classificar|classifica|classifique|categoria|movimento|lan[cç]amento)\s+/i.test(text);
  if(!explicit&&!/^(?:mercado|alimentacao|restaurante|farmacia|compra|compras|uber|pix|pagamento|servico|boleto|loja|conta|gasto)\b/.test(label))
   return null;
  return {type:"clarify",number,category:original};
 }
 const category=normalizeSpace(original.replace(/^(?:prime|empresa|empresarial|pj|pessoal|casa|familia|familiares|pf|pendente|nao classificado|deixar pendente|revisar)\b[\s:,-]*/i,""));
 return {type:"classification",classification:{
  number,destination,category:(destination==="pending"?"":category).slice(0,80)
 }};
}
