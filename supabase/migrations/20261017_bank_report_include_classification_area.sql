-- Distinguish source bank account from user-assigned destination area in WhatsApp / AI statements.
CREATE OR REPLACE FUNCTION public.prime_render_bank_report(p_owner uuid, p_mode text DEFAULT 'imported_today'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 local_today date := (now() at time zone 'America/Sao_Paulo')::date;
 label text; line text; report text;
 total int:=0; shown int:=0; posted int:=0; pending int:=0;
 credits numeric:=0; debits numeric:=0;
 movement record;
begin
 if p_mode not in ('imported_today','today','yesterday','yesterday_today','last7') then raise exception 'Período inválido'; end if;
 if not exists(select 1 from public.workspaces w where w.owner_id=p_owner and w.kind in ('prime','personal'))
 then raise exception 'Proprietário não encontrado'; end if;
 label:=case p_mode
  when 'imported_today' then 'Importados hoje ('||to_char(local_today,'DD/MM/YYYY')||')'
  when 'today' then 'Data bancária de hoje ('||to_char(local_today,'DD/MM/YYYY')||')'
  when 'yesterday' then 'Data bancária de ontem ('||to_char(local_today-1,'DD/MM/YYYY')||')'
  when 'yesterday_today' then 'Datas bancárias de ontem e hoje ('||to_char(local_today-1,'DD/MM')||' a '||to_char(local_today,'DD/MM/YYYY')||')'
  else 'Data bancária dos últimos 7 dias' end;
 select count(*),count(*) filter(where t.provider_status='POSTED'),
 count(*) filter(where t.provider_status<>'POSTED'),
 coalesce(sum(t.amount) filter(where t.direction='credit' and t.provider_status='POSTED'),0),
 coalesce(sum(t.amount) filter(where t.direction='debit' and t.provider_status='POSTED'),0)
 into total,posted,pending,credits,debits
 from public.bank_transactions t
 join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=p_owner
 join public.bank_connections c on c.id=a.connection_id and c.owner_id=p_owner and c.archived_at is null
 join public.workspaces w on w.id=t.workspace_id and w.owner_id=p_owner and w.id=a.workspace_id
 where t.owner_id=p_owner and a.kind='BANK' and a.currency='BRL'
 and (case p_mode
  when 'imported_today' then (t.created_at at time zone 'America/Sao_Paulo')::date=local_today
  when 'today' then t.occurred_on=local_today
  when 'yesterday' then t.occurred_on=local_today-1
  when 'yesterday_today' then t.occurred_on between local_today-1 and local_today
  else t.occurred_on between local_today-6 and local_today
 end);
 report:='PRIME FINANCE | RELATORIO BANCARIO'||E'\n'||label||
 E'\nMovimentos nos extratos já importados: '||total||
 ' ('||posted||' confirmados; '||pending||' pendentes)'||
 E'\nEntradas CONFIRMADAS: R$ '||public.prime_format_brl(credits)||
 E'\nSaídas CONFIRMADAS: R$ '||public.prime_format_brl(debits)||E'\n'||
 'ATENÇÃO: fluxos bancários não são lucro/despesa por si só; aplicações e resgates exigem classificação.'||E'\n';
 if total=0 then
  return report||E'\nNenhum lançamento disponível no aplicativo para esse período.'||
   E'\nO banco pode disponibilizar novos dados posteriormente.'||
   E'\nConsulte: https://prime-finance-ochre.vercel.app/bancos';
 end if;
 report:=report||E'\n';
 for movement in
  select t.occurred_on,t.direction,t.amount,t.description,t.provider_status,
    a.display_name as account_name,w.kind as workspace_kind,cl.destination as chosen_area
  from public.bank_transactions t
  join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=p_owner
  join public.bank_connections c on c.id=a.connection_id and c.owner_id=p_owner and c.archived_at is null
  join public.workspaces w on w.id=t.workspace_id and w.owner_id=p_owner and w.id=a.workspace_id
  left join public.prime_bank_classifications cl on cl.bank_transaction_id=t.id and cl.user_id=p_owner
  where t.owner_id=p_owner and a.kind='BANK' and a.currency='BRL'
  and (case p_mode
    when 'imported_today' then (t.created_at at time zone 'America/Sao_Paulo')::date=local_today
    when 'today' then t.occurred_on=local_today
    when 'yesterday' then t.occurred_on=local_today-1
  when 'yesterday_today' then t.occurred_on between local_today-1 and local_today
    else t.occurred_on between local_today-6 and local_today
   end)
  order by t.occurred_on desc,t.created_at desc,t.id desc limit 18
 loop
  shown:=shown+1;
  line:=shown||'. '||to_char(movement.occurred_on,'DD/MM')||' '||
   case when movement.direction='credit' then 'ENTRADA ' else 'SAÍDA ' end||
   'R$ '||public.prime_format_brl(movement.amount)||
   ' | '||left(regexp_replace(coalesce(movement.account_name,'Banco'),E'[\n\r]+',' ','g'),25)||
   case when movement.workspace_kind='personal' then ' (Pessoal)' else ' (Prime)' end||E'\n'||
   left(regexp_replace(coalesce(movement.description,''),E'[\n\r]+',' ','g'),72)||
   case when movement.provider_status<>'POSTED' then ' [PENDENTE NO BANCO]' else '' end||E'\n';
  line:=line||'   Área: '||case movement.chosen_area
   when 'prime' then 'Empresa'
   when 'personal' then 'Pessoal'
   when 'interest' then 'Empréstimo'
   when 'transfer' then 'Transferência'
   else 'Não classificado' end||E'\n';
  if movement.provider_status='POSTED' then
   if movement.direction='debit' and movement.description ~* '(APL[[:space:]]+APLIC|APLIC[[:space:]]+AUT|APLICACAO|APLICAÇÃO)' then
    line:=line||'   Possível aplicação financeira — transferência, não despesa operacional.'||E'\n';
   elsif movement.direction='credit' and movement.description ~* '(RES[[:space:]]+APLIC|RESGATE[[:space:]]+APLIC)' then
    line:=line||'   Possível resgate de aplicação — não é receita operacional.'||E'\n';
   elsif movement.description ~* '(PARCELA[[:space:]]+GIRO|EMPRESTIMO|EMPRÉSTIMO)' then
    line:=line||'   Possível parcela de crédito — separar capital e juros após conferência.'||E'\n';
   elsif movement.description ~* '(TAR/CUSTAS|TARIFA[[:space:]]+BANC)' then
    line:=line||'   Possível tarifa bancária — conferir classificação.'||E'\n';
   elsif movement.description ~* '(DEBITO[[:space:]]+SEGURO|DÉBITO[[:space:]]+SEGURO)' then
    line:=line||'   Possível seguro — conferir classificação.'||E'\n';
   elsif movement.direction='credit' and movement.description ~* '(SISPAG[[:space:]]+IND|ORTOBOM)' then
    line:=line||'   Possível recebimento de cliente — cruzar com cargas e e-mails.'||E'\n';
   end if;
  end if;
  report:=report||line;
 end loop;
 if total>shown then report:=report||E'\nMais '||(total-shown)||' lançamento(s) na área Bancos.';end if;
 report:=report||E'\n\nConferência: https://prime-finance-ochre.vercel.app/financeiro'||
 E'\nApenas leitura. Não realiza conciliação ou baixa.';
 return left(report,3900);
end $function$;
revoke all on function public.prime_render_bank_report(uuid,text) from public,anon,authenticated;
