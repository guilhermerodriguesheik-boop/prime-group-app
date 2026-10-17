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
 'ATENÇÃO: fluxos bancários não são lucro/despesa por si só; aplicações e resgates exigem classificação.'||E'\n'||
 'Classifique por etapas: envie CLASSIFICAR, escolha a movimentação e depois a área.'||E'\n'||
 'Também pode enviar diretamente: 11 aplicação financeira.'||E'\n';
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
end $function$
;

CREATE OR REPLACE FUNCTION public.prime_queue_bank_review_digest(p_secret text, p_limit integer DEFAULT 22)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 usr record; move record; new_id uuid; message text; item_line text;
 item_ids uuid[]; item_count int; outgoing numeric; incoming numeric;
 suggest_kind text; suggest_name text; suggestion_count int;
 created_count int:=0; batch_size int:=least(greatest(coalesce(p_limit,22),1),22);
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 for usr in
  select pair.user_id from public.whatsapp_pairings pair
  join public.prime_notification_settings s on s.user_id=pair.user_id
  where pair.enabled and pair.connected_at is not null and s.bank_alerts
    and pair.phone_number ~ '^[0-9]{10,15}$'
 loop
  item_ids:=array[]::uuid[];item_count:=0;incoming:=0;outgoing:=0;
  message:='PRIME FINANCE | NOVAS MOVIMENTACOES'||E'\n'||
   'Conferencia bancaria: movimentacoes importadas, sem baixa automatica.'||E'\n\n';
  for move in
   select t.id,t.workspace_id,t.owner_id,t.occurred_on,t.direction,t.amount,t.description,
          a.display_name as account_name,w.kind as workspace_kind
   from public.bank_transactions t
   join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=t.owner_id
   join public.workspaces w on w.id=t.workspace_id and w.owner_id=t.owner_id
   left join public.prime_bank_digest_items seen on seen.bank_transaction_id=t.id
   where t.owner_id=usr.user_id and t.provider_status='POSTED'
     and t.amount>0 and t.review_status='pending'
     and a.kind='BANK' and a.currency='BRL'
     and seen.bank_transaction_id is null
   order by t.created_at,t.id
   for update of t skip locked limit batch_size
  loop
   item_count:=item_count+1;
   item_ids:=array_append(item_ids,move.id);
   if move.direction='credit' then incoming:=incoming+move.amount;
   else outgoing:=outgoing+move.amount; end if;
   -- Candidate hints are deliberately read-only. Same workspace, sign and amount
   -- plus a near due date are mandatory; ambiguous matches remain unassigned.
   suggest_kind:=case when move.direction='credit' then 'receivable' else 'payable' end;
   if move.direction='credit' then
    select count(*),min(left(r.description,48)) into suggestion_count,suggest_name
    from public.receivables r
    where r.workspace_id=move.workspace_id and r.status in ('open','partial','overdue')
     and abs((r.amount-r.received_amount)-move.amount)<=0.01
     and abs(r.due_date-move.occurred_on)<=7;
   else
    select count(*),min(left(p.description,48)) into suggestion_count,suggest_name
    from public.payables p
    where p.workspace_id=move.workspace_id and p.status in ('open','partial','overdue')
     and abs((p.amount-p.paid_amount)-move.amount)<=0.01
     and abs(p.due_date-move.occurred_on)<=7;
   end if;
   item_line:=to_char(move.occurred_on,'DD/MM')||' | '||
    case when move.direction='credit' then 'ENTRADA' else 'SAIDA' end||' R$ '||
    to_char(move.amount,'FM999999990D00')||' | '||
    left(regexp_replace(move.account_name,E'[\n\r]+',' ','g'),35)||' ('||
    case when move.workspace_kind='prime' then 'Empresa'
         when move.workspace_kind='personal' then 'Pessoal' else 'Outro' end||')'||
    E'\n'||left(regexp_replace(move.description,E'[\n\r]+',' ','g'),75);
   if suggestion_count=1 then
    item_line:=item_line||E'\n'||
      'Possivel '||case when move.direction='credit' then 'recebimento' else 'pagamento' end||
      ': '||suggest_name||' [CONFIRMAR]';
   elsif suggestion_count>1 then
    item_line:=item_line||E'\nMultiplas contas possiveis [REVISAR]';
   end if;
   message:=message||item_count||'. '||item_line||E'\n\n';
  end loop;
  if item_count>0 then
   message:=message||'TOTAL: '||item_count||' movimento(s)'||E'\n'||
    'Entradas: R$ '||to_char(incoming,'FM999999990D00')||E'\n'||
    'Saidas: R$ '||to_char(outgoing,'FM999999990D00')||E'\n\n'||
    'Classifique e confira: https://prime-finance-ochre.vercel.app/financeiro'||E'\n'||
    'Envie CLASSIFICAR para selecionar a movimentacao e a area. '||
    'Nenhuma baixa de pagamento ocorre ao classificar.';
   insert into public.prime_outbox(user_id,dedupe_key,category,reference,message)
   values(usr.user_id,'bank-digest:'||item_ids[1]::text,'bank',
    to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYYMMDD'),left(message,3900))
   on conflict(dedupe_key) do nothing returning id into new_id;
   if new_id is not null then
    insert into public.prime_bank_digest_items(bank_transaction_id,owner_id,outbox_id,source)
     select unnest(item_ids),usr.user_id,new_id,'digest'
     on conflict(bank_transaction_id) do nothing;
    insert into public.prime_bank_report_sessions(owner_id,report_id,source)
     values(usr.user_id,new_id,'outbox')
     on conflict(owner_id,report_id) do nothing;
    insert into public.prime_bank_report_slots(owner_id,report_id,source,ordinal,bank_transaction_id)
     select usr.user_id,new_id,'outbox',item.n::smallint,item.tx_id
     from unnest(item_ids) with ordinality as item(tx_id,n)
     where item.n<=22 and position(E'\n'||item.n::text||'. ' in left(message,3900))>0
     on conflict(owner_id,report_id,ordinal) do nothing;
    created_count:=created_count+1;
   end if;
   new_id:=null;
  end if;
 end loop;
 return created_count;
end $function$
;