"use client";
import { useActionState } from "react";
import { importFiscalNfe, type FiscalImportState } from "@/app/fiscal/actions";

const initialState: FiscalImportState = { ok: false, message: "" };
export function FiscalImportForm() {
  const [state, action, pending] = useActionState(importFiscalNfe, initialState);
  return (
    <form action={action} className="card" style={{display:"grid",gap:14,maxWidth:740}}>
      <h3>Importar nota da Ortobom</h3>
      <p>Cria apenas um rascunho de CT-e; nao envia documento fiscal a SEFAZ.</p>
      <label style={{display:"grid",gap:5}}>
        XML da NF-e autorizada
        <input name="xml" type="file" required accept=".xml,application/xml,text/xml" />
      </label>
      <label style={{display:"grid",gap:5}}>
        CIOT informado pela Ortobom
        <input name="ciot" type="text" required maxLength={16}
          inputMode="numeric" pattern="[0-9]{11,12}" placeholder="11 ou 12 digitos"/>
      </label>
      <label style={{display:"grid",gap:5}}>
        Valor contratado do frete (R$)
        <input name="freight" type="text" required inputMode="decimal"
          placeholder="Ex.: 3420,00"/>
      </label>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Validando arquivo..." : "Importar e preparar rascunho"}
      </button>
      {state.message && <p role="status" style={{color:state.ok?"#147d49":"#b44636"}}>{state.message}</p>}
    </form>
  );
}
