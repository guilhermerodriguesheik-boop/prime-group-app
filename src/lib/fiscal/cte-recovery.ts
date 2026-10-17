/**
 * Distinguish a pre-transmission validation failure from an unknown SEFAZ result.
 * An HTTP status alone cannot prove that there was no fiscal emission.
 * Only structured rejection evidence or a narrowly recognized missing-fields
 * validation is allowed to start a corrected attempt.
 */
export function fiscalErrorText(value:unknown):string{
 const v=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const words=[v.message,v.mensagem,v.detail,v.error,v.erro,v.mensagem_original,v.errors];
 return words.map(x=>typeof x==="string"?x:typeof x==="object"&&x?JSON.stringify(x):"")
  .filter(Boolean).join(" | ").replace(/dc_(?:live|test)_[A-Za-z0-9._-]+/g,"[CHAVE_OCULTADA]")
  .replace(/Bearer\s+[^\s"']+/gi,"Bearer [CHAVE_OCULTADA]").slice(0,1100);
}
export function definitiveCteRejection(httpStatus:number,body:Record<string,unknown>):boolean{
 if(body.autorizado===false&&
    /^[0-9]{3}$/.test(String(body.codigo_status_sefaz??""))&&
    !body.chave_acesso&&!body.protocolo)return true;
 if(httpStatus!==422||body.chave_acesso||body.protocolo||body.autorizado===true)return false;
 const msg=fiscalErrorText(body);
 const code=String(body.code??body.error_code??"").toUpperCase();
 // Explicit DotCompany payload/schema rejection before the fiscal authorizer.
 const field=/(remetente_id|destinatario_id)/i.test(msg);
 const missing=/(obrigat[oó]ri|ausent|faltan|faltam|missing|required|necess[aá]ri)/i.test(msg);
 return field&&missing || /^(?:MISSING_PERSON_IDS|PESSOAS_OBRIGATORIAS)$/.test(code);
}
export type FiscalCorrection={title:string;description:string;action:"cadastros"|"configurar"|"emissor"|"consultar";retryPossible:boolean};
export function correctionFromProvider(status:string|undefined,errorCode:string|null|undefined,
 response:Record<string,unknown>|null|undefined):FiscalCorrection{
 const detail=String(response?.message||response?.reason||"");
 const check=(errorCode||"")+" "+detail;
 if(status==="authorized")return {title:"CT-e autorizado",description:"Documento emitido; não reenviar.",action:"consultar",retryPossible:false};
 if(status==="sending"||status==="indeterminate"){
  return {title:"Resultado anterior precisa de reconciliação",
   description:detail||"Consulte o protocolo ou a chave na DotCompany antes de liberar outra tentativa. Uma listagem vazia não basta.",
   action:"consultar",retryPossible:false};
 }
 if(/remetente_id|destinatario_id|PESSOAS/i.test(check)){
  return {title:"Cadastro do remetente ou destinatário",
   description:"Os IDs das empresas são consultados/cadastrados pela integração. Confira os CNPJs das NF-e e salve a conferência.",
   action:"cadastros",retryPossible:response?.definitive_rejection===true};
 }
 if(/(?:CFOP|TOMADOR|DRIVER|VEHICLE|UF_|PRODUCT|PRECHECK)/i.test(check))
  return {title:"Corrigir dados do transporte",description:"Edite os campos destacados e salve. O aplicativo fará uma nova pré-validação.",action:"configurar",retryPossible:response?.definitive_rejection===true};
 if(/SERI|NUMERA|PERFIL|CREDENCI|RNTRC|IMPOST|TRIBUT|CERTIF/i.test(check))
  return {title:"Configuração do emissor",description:"Confira o cadastro de produção, série fiscal, RNTRC e regime na DotCompany.",action:"emissor",retryPossible:false};
 return {title:"Revisar rejeição fiscal",description:detail||
  "Corrija os campos apontados e confira novamente. Novo envio só será habilitado após rejeição definitivamente confirmada.",action:"configurar",
  retryPossible:status==="rejected"&&response?.definitive_rejection===true};
}
