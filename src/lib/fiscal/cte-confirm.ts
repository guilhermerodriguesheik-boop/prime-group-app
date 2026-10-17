/** CT-e preview and blocking preflight; never trust client-provided fiscal payloads. */
import {createHash} from "node:crypto";
import {safeCteCompliance,cteComplianceIssues,type CteCompliance} from "@/lib/fiscal/cte-compliance";
import {prefillCteCompliance} from "@/lib/fiscal/cte-autofill";
import {validCpf} from "@/lib/fiscal/preflight";
import {preflightCte,type ApiData} from "@/lib/fiscal/dotcompany";

export type CteConfig={
  cfop:string;tomador:string;produto_predominante:string;uf_licenciamento:string;
  numbering_verified:boolean;compliance:CteCompliance;
};
export type CteDraft={
  id:string;status:string;updated_at:string;cargo_reference:string|null;ciot:string|null;
  freight_value:number|string|null;checklist:Record<string,unknown>|null;
  vehicle_id:string|null;driver_id:string|null;
};
export type CteInvoice={
  access_key:string;invoice_number:string;origin_uf:string;destination_uf:string;
  goods_value:number|string|null;gross_weight_kg:number|string|null;xml_content?:string|null;
};
export type CteDriver={id:string;name:string;document:string;active:boolean;license_expires_on?:string|null};
export type CteVehicle={id:string;plate:string;nickname:string;status:string};
export type CteProfile={rntrc:string|null;rntrc_checked_at:string|null;cte_defaults?:unknown};
export type CteReviewInput={
 draft:CteDraft;notes:CteInvoice[];driver:CteDriver|null;vehicle:CteVehicle|null;
 profile:CteProfile|null;issuerTax?:{crt?:string;cst_icms?:string};configured:boolean;liveEnabled:boolean;existingSubmission:boolean;retryAllowed?:boolean;
};
const normalize=(value:unknown)=>String(value??"").replace(/\D/g,"");
const plate=(value:unknown)=>String(value??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
export function safeConfig(raw:unknown):CteConfig{
 const data=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
 return {
  cfop:String(data.cfop||"").trim().slice(0,4),
  tomador:String(data.tomador||"").trim().slice(0,1),
  produto_predominante:String(data.produto_predominante||"").trim().slice(0,120),
  uf_licenciamento:String(data.uf_licenciamento||"").trim().toUpperCase().slice(0,2),
  numbering_verified:data.numbering_verified===true,
  compliance:safeCteCompliance(data.compliance),
 };
}
export function ctePreview(input:CteReviewInput){
 const {draft,notes,driver,vehicle,profile}=input;
 const defaults=profile?.cte_defaults&&typeof profile.cte_defaults==="object"&&!Array.isArray(profile.cte_defaults)
  ? profile.cte_defaults as Record<string,unknown>:{};
 const routeMatch=defaults.origin_uf===notes[0]?.origin_uf&&defaults.destination_uf===notes[0]?.destination_uf;
 // A reviewed template may supply tax classification only for a matching route.
 // Explicit consent and number/duplicate verification are NEVER inherited.
 const source=draft.checklist?.cte_provider_config||
  (routeMatch?{...defaults,numbering_verified:false}:{});
 const c=safeConfig(source);
 const auto=prefillCteCompliance({current:c.compliance,notes,
  transport:{rntrc_checked_at:profile?.rntrc_checked_at,ciot:draft.ciot,
   license_expires_on:driver?.license_expires_on,
   tax_crt:input.issuerTax?.crt||String(defaults.crt||""),
   tax_cst:input.issuerTax?.cst_icms||String(defaults.cst_icms||"")}}); 
 c.compliance=auto.compliance;
 const missing:string[]=[];
 if(draft.status!=="draft")missing.push("CT-e não está em rascunho editável.");
 if(draft.checklist?.do_not_issue_duplicate===true||
    draft.checklist?.previous_external_cte_key||
    draft.checklist?.previous_external_cte_number)
  missing.push("Esta carga possui indício de CT-e emitido fora do Prime Finance. Não transmitir novamente.");
 if(input.existingSubmission&&!input.retryAllowed)missing.push("Já existe uma tentativa de transmissão para este rascunho. Consulte o resultado antes de tentar novamente.");
 if(!notes.length)missing.push("NF-e da carga não localizada.");
 if(notes.length>40)missing.push("Quantidade de NF-e excede o limite de revisão de 40.");
 const ufInicio=String(notes[0]?.origin_uf||"").toUpperCase();
 const ufFim=String(notes[0]?.destination_uf||"").toUpperCase();
 if(notes.some(x=>x.origin_uf!==ufInicio||x.destination_uf!==ufFim))
  missing.push("Notas fiscais têm UFs de origem/destino divergentes.");
 if(!notes.every(x=>/^\d{44}$/.test(x.access_key)))missing.push("Chave de acesso inválida em uma das NF-e.");
 if(c.compliance.ciot_aplicabilidade!=="dispensado"&&!/^\d{11,12}$/.test(normalize(draft.ciot)))
  missing.push("CIOT não encontrado ou inválido quando exigível.");
 if(!vehicle||vehicle.status!=="active"||!vehicle.plate||!(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate(vehicle.plate))))
  missing.push("Selecione um veículo ativo com placa válida.");
 if(!driver||!driver.active||!validCpf(driver.document||"")||driver.name?.trim().length<4)
  missing.push("Selecione um motorista ativo com CPF válido.");
 if(!profile?.rntrc||!/^[0-9]{8,9}$/.test(normalize(profile.rntrc))||/^0+$/.test(normalize(profile.rntrc)))
  missing.push("RNTRC da transportadora ausente ou inválido.");
 if(!profile?.rntrc_checked_at)missing.push("RNTRC precisa ser conferido na ANTT antes da emissão.");
 if(!/^[56]\d{3}$/.test(c.cfop))missing.push("Informe CFOP válido (início 5 ou 6) e confira a tributação.");
 if(!/^[0-4]$/.test(c.tomador))missing.push("Identifique o tomador do frete.");
 if(c.produto_predominante.length<3)missing.push("Informe o produto predominante.");
 if(!/^[A-Z]{2}$/.test(c.uf_licenciamento))missing.push("Informe a UF correta de licenciamento do veículo.");
 if(!c.numbering_verified)missing.push("Confirme a sequência fiscal com o emissor anterior antes de transmitir.");
 missing.push(...cteComplianceIssues(c.compliance,draft.ciot));
 const value=Number(draft.freight_value);
 const goods=notes.reduce((sum,x)=>sum+Number(x.goods_value||0),0);
 const weight=notes.reduce((sum,x)=>sum+Number(x.gross_weight_kg||0),0);
 if(!Number.isFinite(value)||value<=0)missing.push("Valor do frete precisa ser validado.");
 if(!Number.isFinite(goods)||goods<=0)missing.push("Valor das mercadorias não é válido.");
 if(!Number.isFinite(weight)||weight<=0)missing.push("Peso bruto das mercadorias não está completo nas NF-e.");
 const payload:ApiData={
  uf_inicio:ufInicio,uf_fim:ufFim,cfop:c.cfop,modal:"01",tomador:c.tomador,
  produto_predominante:c.produto_predominante,peso_bruto:weight,valor_carga:goods,valor_frete:value,
  documentos:notes.map(x=>({chave_acesso:x.access_key})),
  veiculos:vehicle?[{placa:plate(vehicle.plate),uf_licenciamento:c.uf_licenciamento}]:[],
  motoristas:driver?[{cpf:normalize(driver.document),nome:driver.name}]:[],
 };
 for(const code of preflightCte(payload))missing.push("Pré-validação fiscal: "+code+".");
 if(!input.configured)missing.push("Chave DotCompany de Produção não configurada na Vercel.");
 if(!input.liveEnabled)missing.push("Emissão real desabilitada até validação fiscal e homologação.");
 const unique=[...new Set(missing)];
 const hash=createHash("sha256").update(JSON.stringify({
  id:draft.id,changed:draft.updated_at,checklist:draft.checklist,
  payload,ciot:draft.ciot,goods,weight,compliance:c.compliance,rntrc:profile?.rntrc,checked:profile?.rntrc_checked_at
 })).digest("hex");
 return {payload,missing:unique,ready:unique.length===0,retryAllowed:input.retryAllowed===true,hash,invoiceCount:notes.length,
  freightValue:value,goodsValue:goods,grossWeight:weight,ciot:draft.ciot,
  cargoReference:draft.cargo_reference,rntrc:profile?.rntrc||null,config:c,
  autofilled:auto.autofilled,advisories:auto.advisories};
}
export function productionKey(token:unknown):token is string{
 return typeof token==="string"&&/^dc_live_[a-zA-Z0-9._-]{16,}$/.test(token);
}
