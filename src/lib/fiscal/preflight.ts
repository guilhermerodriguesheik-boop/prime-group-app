/**
 * Camada de pré-validação de rascunhos. Não gera XML de documento fiscal,
 * não assina XML e nunca transmite à SEFAZ.
 */
export type MdfePreparationInput = {
  cteDraftId: string;
  plate: string;
  rntrc: string;
  driverCpf: string;
  originUf: string;
  destinationUf: string;
};

const UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);
export const normalizeDigits = (value: string) => value.replace(/\D/g,"");
export const normalizePlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g,"");
/** Não oferecer preparação de novo CT-e quando existir sinal de emissão externa. */
export function canPrepareNewCte(status:string,checklist:unknown):boolean{
 if(status!=="draft")return false;
 if(!checklist||typeof checklist!=="object"||Array.isArray(checklist))return true;
 const flags=checklist as Record<string,unknown>;
 return flags.do_not_issue_duplicate!==true && flags.previous_external_cte_key==null;
}

export function validCpf(value: string): boolean {
  const cpf = normalizeDigits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const length of [9,10]) {
    const total = [...cpf.slice(0,length)].reduce((sum,digit,index) =>
      sum + Number(digit) * (length + 1 - index),0);
    const digit = ((total * 10) % 11) % 10;
    if (digit !== Number(cpf[length])) return false;
  }
  return true;
}

export function validCteAccessKey(value: string): boolean {
  const key = normalizeDigits(value);
  if (!/^\d{44}$/.test(key)) return false;
  let weight=2,sum=0;
  for(let i=42;i>=0;i--){
    sum += Number(key[i])*weight;
    weight = weight === 9 ? 2 : weight+1;
  }
  const mod=sum%11;
  const check=mod===0||mod===1?0:11-mod;
  return check===Number(key[43]);
}

export function validateMdfePreparation(input: MdfePreparationInput): string[] {
  const errors: string[]=[];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.cteDraftId)) {
    errors.push("Selecione um rascunho de CT-e valido.");
  }
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(input.plate))) {
    errors.push("Informe uma placa brasileira valida.");
  }
  if (!/^\d{8,9}$/.test(normalizeDigits(input.rntrc))) {
    errors.push("Informe o RNTRC com 8 ou 9 digitos para conferencia.");
  }
  if (!validCpf(input.driverCpf)) {
    errors.push("Informe um CPF de motorista valido.");
  }
  const start=input.originUf.trim().toUpperCase();
  const end=input.destinationUf.trim().toUpperCase();
  if (!UFS.has(start) || !UFS.has(end)) {
    errors.push("Informe as UFs validas de carregamento e descarregamento.");
  }
  return errors;
}

/**
 * Emissão real depende de autorização fiscal, certificado sob custódia
 * exclusiva do backend, XML validado contra XSD vigente e retorno SEFAZ.
 * Esta função é propositalmente não liberadora.
 */
export function mdfeTransmissionBlockers(): string[] {
  return [
    "CT-e autorizado e protocolo da SEFAZ ainda nao vinculados.",
    "Assinatura digital A1, XML MDF-e 3.00b e schemas vigentes ainda nao homologados.",
    "Municipios IBGE, percurso, cargas, veiculos, seguro e regras fiscais precisam ser validados.",
    "Credenciamento, numeracao sequencial e ambiente SEFAZ nao foram homologados.",
  ];
}
