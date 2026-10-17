export type BankReportPeriod="imported_today"|"today"|"yesterday"|"yesterday_today"|"last7";
export type BankReportIntent={period:BankReportPeriod;sendWhatsApp:boolean};
export function detectBankReportIntent(raw:string):BankReportIntent|null{
 const s=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
 if(s.length>350)return null;
 const asks=/(?:\b(?:extrato|relatorio|resumo|movimentac(?:ao|oes)|lancamentos?)\b)/.test(s);
 const bankContext=/(?:\b(?:banco|bancos|bancario|bancaria|financeiro|contas?|pix|extrato)\b)/.test(s);
 // On a dedicated Finance WhatsApp, a bare dated "me envia o relatório de ontem
 // e hoje" refers to the bank statement. Keep unrelated named reports out.
 const datedBareReport=/(?:^|\b)(?:envi[ae]|manda|mande|mostr[ae]|quero|preciso)\b/.test(s)
  && /\brelatorio\s+(?:de\s+)?(?:ontem|hoje)(?:\b|$)/.test(s)
  && !/\b(?:fretes?|cargas?|motoristas?|cte|mdfe|clientes?|estoque|vendas?)\b/.test(s);
 if(!asks||(!bankContext&&!datedBareReport))return null;
 const period:BankReportPeriod=/\b(?:ultimos?\s*(?:7|sete)\s*dias?|semana)\b/.test(s)?"last7":
  /\bontem\b/.test(s)&&/\bhoje\b/.test(s)?"yesterday_today":
  /\bontem\b/.test(s)?"yesterday":
  /\b(?:importad[oa]s?|recebid[oa]s?|sincronizad[oa]s?|atualizad[oa]s?)\s*hoje\b/.test(s)?"imported_today":
  /\bhoje\b/.test(s)?"today":"imported_today";
 const sendWhatsApp=/\b(?:envi[ae]|manda|mande|mandar|dispara|disparar)\b/.test(s)
  && /\b(?:whatsapp|what?s?app|zap|wpp|meu numero)\b/.test(s);
 return {period,sendWhatsApp};
}
