/**
 * Document review declarations, not authoritative SEFAZ/ANTT verification.
 * Keep the operation editable; actual emission must use the separate
 * authenticated provider + consent + SEFAZ acknowledgment workflow.
 */
export type CteCompliance={
 nfe_status:"pendente"|"conferencia_manual"|"consulta_oficial";
 nfe_consulta_ref:string;
 crt:""|"1"|"2"|"3";
 cst_icms:string;
 tributacao_conferida:boolean;
 municipio_inicio_ibge:string;
 municipio_fim_ibge:string;
 antt_review:"pendente"|"conferido";
 antt_referencia:string;
 ciot_aplicabilidade:"pendente"|"obrigatorio"|"dispensado";
 ciot_conferido:boolean;
 ciot_justificativa:string;
 crlv_status:"pendente"|"conferido";
 crlv_exercicio:string;
 cnh_status:"pendente"|"conferido";
 cnh_categoria:""|"C"|"D"|"E";
 cnh_validade:string;
};
export const emptyCteCompliance:CteCompliance={
 nfe_status:"pendente",nfe_consulta_ref:"",
 crt:"",cst_icms:"",tributacao_conferida:false,
 municipio_inicio_ibge:"",municipio_fim_ibge:"",
 antt_review:"pendente",antt_referencia:"",
 ciot_aplicabilidade:"pendente",ciot_conferido:false,ciot_justificativa:"",
 crlv_status:"pendente",crlv_exercicio:"",
 cnh_status:"pendente",cnh_categoria:"",cnh_validade:"",
};
const digits=(v:unknown,max:number)=>String(v??"").replace(/\D/g,"").slice(0,max);
const allowed=<T extends string>(v:unknown,choices:readonly T[],fallback:T):T=>
 typeof v==="string"&&choices.includes(v as T)?v as T:fallback;
export function safeCteCompliance(v:unknown):CteCompliance{
 const x=v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
 return {
  nfe_status:allowed(x.nfe_status,["pendente","conferencia_manual","consulta_oficial"],"pendente"),
  nfe_consulta_ref:String(x.nfe_consulta_ref??"").trim().slice(0,120),
  crt:allowed(x.crt,["","1","2","3"],""),
  cst_icms:allowed(x.cst_icms,["","00","20","40","41","50","51","60","90"],""),
  tributacao_conferida:x.tributacao_conferida===true,
  municipio_inicio_ibge:digits(x.municipio_inicio_ibge,7),
  municipio_fim_ibge:digits(x.municipio_fim_ibge,7),
  antt_review:allowed(x.antt_review,["pendente","conferido"],"pendente"),
  antt_referencia:String(x.antt_referencia??"").trim().slice(0,120),
  ciot_aplicabilidade:allowed(x.ciot_aplicabilidade,["pendente","obrigatorio","dispensado"],"pendente"),
  ciot_conferido:x.ciot_conferido===true,
  ciot_justificativa:String(x.ciot_justificativa??"").trim().slice(0,180),
  crlv_status:allowed(x.crlv_status,["pendente","conferido"],"pendente"),
  crlv_exercicio:digits(x.crlv_exercicio,4),
  cnh_status:allowed(x.cnh_status,["pendente","conferido"],"pendente"),
  cnh_categoria:allowed(x.cnh_categoria,["","C","D","E"],""),
  cnh_validade:typeof x.cnh_validade==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x.cnh_validade)?
   x.cnh_validade:"",
 };
}
export function cteComplianceIssues(c:CteCompliance,ciot:string|null):string[]{
 const issues:string[]=[];
 if(c.nfe_status!=="consulta_oficial"||!c.nfe_consulta_ref)
  issues.push("Informe a consulta oficial da NF-e (situação/autenticidade e referência).");
 if(!c.crt||!c.cst_icms||!c.tributacao_conferida)
  issues.push("Confira CRT, CST ICMS e tributação aplicável ao CT-e com a contabilidade.");
 if(!/^\d{7}$/.test(c.municipio_inicio_ibge)||!/^\d{7}$/.test(c.municipio_fim_ibge))
  issues.push("Informe os códigos IBGE de 7 dígitos dos municípios de início e término.");
 if(c.antt_review!=="conferido"||!c.antt_referencia)
  issues.push("Informe referência da consulta oficial do RNTRC à ANTT.");
 if(c.ciot_aplicabilidade==="pendente"||
    c.ciot_aplicabilidade==="obrigatorio"&&(!c.ciot_conferido||!/^[0-9]{11,12}$/.test((ciot||"").replace(/\D/g,"")))||
    c.ciot_aplicabilidade==="dispensado"&&c.ciot_justificativa.length<10)
  issues.push("Confirme aplicabilidade e situação do CIOT; justifique eventual dispensa.");
 if(c.crlv_status!=="conferido"||!/^20\d{2}$/.test(c.crlv_exercicio))
  issues.push("Confira CRLV/documentação do veículo e o exercício.");
 if(c.cnh_status!=="conferido"||!c.cnh_categoria||!c.cnh_validade||
    Number.isNaN(Date.parse(c.cnh_validade))||Date.parse(c.cnh_validade)<Date.now())
  issues.push("Confira a CNH, categoria e validade do motorista.");
 return issues;
}
