import type {CteCompliance} from "@/lib/fiscal/cte-compliance";

/** Extraction from imported NF-e XML and previously verified transport records.
 * A received XML with cStat=100 is NOT a current SEFAZ consultation.
 */
export type ImportedNfeEvidence={xml_content?:string|null;access_key:string};
export type VerifiedTransportEvidence={
 rntrc_checked_at?:string|null;
 ciot?:string|null;
 license_expires_on?:string|null;
 tax_crt?:string|null;
 tax_cst?:string|null;
};
function grab(xml:string,pattern:RegExp):string{
 return xml.match(pattern)?.[1]||"";
}
export function extractNfeEvidence(note:ImportedNfeEvidence){
 const xml=note.xml_content||"";
 const origin=grab(xml,/<(?:\w+:)?enderEmit\b[^>]*>[\s\S]*?<(?:\w+:)?cMun>(\d{7})<\/(?:\w+:)?cMun>/);
 const dest=grab(xml,/<(?:\w+:)?enderDest\b[^>]*>[\s\S]*?<(?:\w+:)?cMun>(\d{7})<\/(?:\w+:)?cMun>/);
 const infProt=xml.match(/<(?:\w+:)?infProt\b[^>]*>([\s\S]*?)<\/(?:\w+:)?infProt>/)?.[1]||"";
 const cStat=grab(infProt,/<(?:\w+:)?cStat>(\d{3})<\/(?:\w+:)?cStat>/);
 const protocol=grab(infProt,/<(?:\w+:)?nProt>(\d{8,20})<\/(?:\w+:)?nProt>/);
 const confirmedKey=grab(infProt,/<(?:\w+:)?chNFe>(\d{44})<\/(?:\w+:)?chNFe>/);
 return {origin,dest,cStat,protocol,authorizedInXml:cStat==="100"&&!!protocol&&
  (!confirmedKey||confirmedKey===note.access_key)};
}
function allSame(values:string[]):string{
 return values.length&&values.every(v=>!!v&&v===values[0])?values[0]:"";
}
function taxCode(value:string|null|undefined,valid:RegExp){
 const s=String(value??"").trim();
 return valid.test(s)?s:"";
}
export function prefillCteCompliance(args:{
 current:CteCompliance;
 notes:ImportedNfeEvidence[];
 transport:VerifiedTransportEvidence;
}):{compliance:CteCompliance;autofilled:string[];advisories:string[]} {
 const {current,notes,transport}=args;
 const c={...current};
 const autofilled:string[]=[];
 const advisories:string[]=[];
 const parsed=notes.map(extractNfeEvidence);
 const origin=allSame(parsed.map(n=>n.origin));
 const destination=allSame(parsed.map(n=>n.dest));
 if(origin){c.municipio_inicio_ibge=origin;autofilled.push("Código IBGE de início (XML)");}
 if(destination){c.municipio_fim_ibge=destination;autofilled.push("Código IBGE de destino (XML)");}
 if(notes.length&&parsed.every(n=>n.authorizedInXml)){
  // Distinct from a live official consultation; do not pretend it was executed.
  if(c.nfe_status!=="consulta_oficial"||!c.nfe_consulta_ref){
   c.nfe_status="xml_autorizado";
   c.nfe_consulta_ref="XML importado: cStat 100; "+parsed.slice(0,3).map(n=>n.protocol).join(", ");
  }
  autofilled.push("Protocolo de autorização existente no XML (não atual)");
 }else{
  advisories.push("A importação não contém protocolo de autorização em todas as NF-e. O autorizador poderá rejeitar o documento.");
 }
 if(transport.rntrc_checked_at){
  c.antt_review="conferido";
  if(!c.antt_referencia)c.antt_referencia="Registro ANTT verificado em "+transport.rntrc_checked_at.slice(0,10);
  autofilled.push("RNTRC — conferência ANTT anteriormente registrada");
 }else advisories.push("Não há registro de consulta ANTT para o RNTRC.");
 const ciot=String(transport.ciot||"").replace(/\D/g,"");
 if(/^\d{11,12}$/.test(ciot)){
  if(c.ciot_aplicabilidade==="pendente")c.ciot_aplicabilidade="informado";
  autofilled.push("CIOT informado na carga pela contratante");
 }else if(c.ciot_aplicabilidade!=="dispensado"){
  advisories.push("CIOT ausente; verifique se é exigível na operação.");
 }
 const crt=taxCode(transport.tax_crt,/^[123]$/);
 const cst=taxCode(transport.tax_cst,/^(00|20|40|41|50|51|60|90)$/);
 if(crt&&!c.crt){c.crt=crt as "1"|"2"|"3";autofilled.push("CRT do perfil fiscal do emissor");}
 if(cst&&!c.cst_icms){c.cst_icms=cst;autofilled.push("CST do perfil fiscal da DotCompany");}
 if(!c.cst_icms)advisories.push("CST ICMS não identificado; o emissor deve utilizar sua configuração fiscal correta.");
 if(transport.license_expires_on&&!c.cnh_validade){
  c.cnh_validade=transport.license_expires_on.slice(0,10);
  autofilled.push("Validade da CNH do cadastro do motorista");
 }
 if(c.crlv_status!=="conferido")advisories.push("CRLV não verificado automaticamente; documentação deve estar regular.");
 if(c.cnh_status!=="conferido")advisories.push("Categoria e aptidão da CNH não foram conferidas em órgão oficial.");
 return {compliance:c,autofilled,advisories};
}
