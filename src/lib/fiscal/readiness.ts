export type FiscalReadinessInput={
  gmailConnected:boolean;gmailClientAccepted:boolean;gmailClientRejected:boolean;
  nfeCount:number;cteDraftCount:number;hasDriver:boolean;hasVehicle:boolean;
  rntrcProvided:boolean;focusHomologation:boolean;focusProduction:boolean;
  authorizedCteCount:number;fiscalDataReviewed:boolean;
};
export type FiscalStep={id:string;label:string;description:string;state:"done"|"pending"|"blocked"};
export function fiscalReadiness(s:FiscalReadinessInput):FiscalStep[]{
 const state=(done:boolean):FiscalStep["state"]=>done?"done":"pending";
 return [
  {id:"nfe",label:"Notas fiscais da carga",description:s.nfeCount+" NF-e armazenadas; XML recebido não significa autorização do CT-e.",state:state(s.nfeCount>0)},
  {id:"gmail",label:"Importação automática Ortobom",description:s.gmailConnected?"Conexão OAuth registrada.":s.gmailClientRejected?"O Google rejeitou o segredo OAuth configurado; não adianta repetir o consentimento.":"Ainda sem vínculo do Gmail no banco.",state:s.gmailClientRejected?"blocked":state(s.gmailConnected)},
  {id:"cadastros",label:"Motorista e veículo",description:"É necessário cadastrar condutor e veículo reais e vinculá-los às viagens.",state:state(s.hasDriver&&s.hasVehicle)},
  {id:"antt",label:"RNTRC e CIOT",description:s.rntrcProvided?"Número do RNTRC registrado; regularidade ainda deve ser confirmada na ANTT.":"RNTRC e regularidade perante a ANTT ainda não comprovados.",state:"pending"},
  {id:"dados",label:"Parâmetros do CT-e",description:"Tomador, CFOP, ICMS, municípios IBGE, série, sequência e modalidade devem ser conferidos.",state:state(s.fiscalDataReviewed)},
  {id:"focus",label:"Autorizador fiscal — homologação",description:s.focusHomologation?"Token cadastrado; credenciamento e transmissão ainda precisam de teste.":"Ainda falta habilitar e credenciar o emitente no autorizador fiscal.",state:"pending"},
  {id:"cte",label:"CT-e autorizado",description:s.authorizedCteCount>0?"Há registros com status autorizado para conferência.":"Não há protocolo SEFAZ de CT-e autorizado vinculado à viagem.",state:state(s.authorizedCteCount>0)},
  {id:"mdfe",label:"MDF-e assinado e autorizado",description:"Exige CT-e autorizado, viagem completa e retorno da SEFAZ. O aplicativo não pode tratar rascunhos como manifesto emitido.",state:"pending"},
  {id:"focus_prod",label:"Produção do emissor",description:s.focusProduction?"Token de produção cadastrado; depende de habilitação e homologação legal.":"Token de produção ainda não cadastrado.",state:"pending"},
 ];
}
