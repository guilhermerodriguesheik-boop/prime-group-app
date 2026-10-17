"use client";
import type {CteCompliance} from "@/lib/fiscal/cte-compliance";
type Props={value:CteCompliance;onChange:(v:CteCompliance)=>void;disabled:boolean;ciot:string;onCiotChange:(v:string)=>void;rntrc:string|null};
export function CteComplianceFields({value:v,onChange,disabled,ciot,onCiotChange,rntrc}:Props){
 const set=<K extends keyof CteCompliance>(k:K,x:CteCompliance[K])=>onChange({...v,[k]:x});
 return <div className="fiscal-review-summary">
  <h4>Conferência fiscal e documental</h4>
  <p>Campos declaratórios: preencher não substitui consulta real à SEFAZ, ANTT ou DETRAN.</p>
  <fieldset disabled={disabled}><legend>NF-e — consulta</legend>
   <label>Situação da NF-e<select value={v.nfe_status} onChange={e=>set("nfe_status",e.target.value as CteCompliance["nfe_status"])}>
    <option value="pendente">Não consultada</option><option value="conferencia_manual">XML conferido manualmente</option>
    <option value="consulta_oficial">Consulta oficial realizada</option></select></label>
   <label>Referência da consulta oficial<input value={v.nfe_consulta_ref} maxLength={120}
    onChange={e=>set("nfe_consulta_ref",e.target.value)} placeholder="Protocolo/referência"/></label>
  </fieldset>
  <fieldset disabled={disabled}><legend>Tributação e municípios</legend>
   <label>Regime tributário (CRT)<select value={v.crt} onChange={e=>set("crt",e.target.value as CteCompliance["crt"])}>
     <option value="">A confirmar</option><option value="1">1 · Simples Nacional</option>
     <option value="2">2 · Excesso de sublimite</option><option value="3">3 · Regime Normal</option></select></label>
   <label>CST ICMS no CT-e<select value={v.cst_icms} onChange={e=>set("cst_icms",e.target.value)}>
    <option value="">A definir com contabilidade</option>
    <option value="00">00 · Tributação integral</option><option value="20">20 · Redução de base</option>
    <option value="40">40 · Isenta</option><option value="41">41 · Não tributada</option>
    <option value="50">50 · Suspensão</option><option value="51">51 · Diferimento</option>
    <option value="60">60 · Cobrado anteriormente</option><option value="90">90 · Outras</option>
   </select></label>
   <label>IBGE município de início<input value={v.municipio_inicio_ibge} maxLength={7} inputMode="numeric"
     onChange={e=>set("municipio_inicio_ibge",e.target.value.replace(/\D/g,"").slice(0,7))}/></label>
   <label>IBGE município de término<input value={v.municipio_fim_ibge} maxLength={7} inputMode="numeric"
     onChange={e=>set("municipio_fim_ibge",e.target.value.replace(/\D/g,"").slice(0,7))}/></label>
   <label className="fiscal-check-field"><input type="checkbox" checked={v.tributacao_conferida}
     onChange={e=>set("tributacao_conferida",e.target.checked)}/> CFOP, CST e tributação conferidos</label>
  </fieldset>
  <fieldset disabled={disabled}><legend>ANTT e CIOT</legend>
   <p>RNTRC atual: {rntrc||"Pendente"}</p>
   <label>RNTRC / ANTT<select value={v.antt_review} onChange={e=>set("antt_review",e.target.value as CteCompliance["antt_review"])}>
     <option value="pendente">Não consultado</option><option value="conferido">Conferido na ANTT</option></select></label>
   <label>Referência da ANTT<input value={v.antt_referencia} maxLength={120} onChange={e=>set("antt_referencia",e.target.value)}/></label>
   <label>Aplicabilidade do CIOT<select value={v.ciot_aplicabilidade} onChange={e=>set("ciot_aplicabilidade",e.target.value as CteCompliance["ciot_aplicabilidade"])}>
    <option value="pendente">A verificar</option><option value="obrigatorio">Obrigatório</option>
    <option value="dispensado">Dispensado, mediante justificativa</option></select></label>
   <label>Número CIOT<input value={ciot} maxLength={12} inputMode="numeric"
    onChange={e=>onCiotChange(e.target.value.replace(/\D/g,"").slice(0,12))}/></label>
   {v.ciot_aplicabilidade==="obrigatorio"&&
    <label className="fiscal-check-field"><input type="checkbox" checked={v.ciot_conferido}
     onChange={e=>set("ciot_conferido",e.target.checked)}/>CIOT conferido</label>}
   {v.ciot_aplicabilidade==="dispensado"&&
    <label>Justificativa de dispensa<input maxLength={180} value={v.ciot_justificativa}
    onChange={e=>set("ciot_justificativa",e.target.value)}/></label>}
  </fieldset>
  <fieldset disabled={disabled}><legend>Veículo e motorista</legend>
   <label>CRLV<select value={v.crlv_status} onChange={e=>set("crlv_status",e.target.value as CteCompliance["crlv_status"])}>
    <option value="pendente">Pendente</option><option value="conferido">Conferido</option></select></label>
   <label>Exercício CRLV<input value={v.crlv_exercicio} maxLength={4} inputMode="numeric"
    onChange={e=>set("crlv_exercicio",e.target.value.replace(/\D/g,"").slice(0,4))}/></label>
   <label>CNH<select value={v.cnh_status} onChange={e=>set("cnh_status",e.target.value as CteCompliance["cnh_status"])}>
    <option value="pendente">Pendente</option><option value="conferido">Conferida</option></select></label>
   <label>Categoria CNH<select value={v.cnh_categoria} onChange={e=>set("cnh_categoria",e.target.value as CteCompliance["cnh_categoria"])}>
    <option value="">Selecione</option><option value="B">B</option><option value="AB">AB</option><option value="AC">AC</option><option value="AD">AD</option><option value="AE">AE</option><option value="C">C</option><option value="D">D</option><option value="E">E</option>
   </select></label>
   <label>Validade CNH<input type="date" value={v.cnh_validade} onChange={e=>set("cnh_validade",e.target.value)}/></label>
  </fieldset>
  <p>Emissão CT-e/MDF-e ocorre em fluxo separado e exige validação do autorizador e confirmação humana.</p>
 </div>;
}
