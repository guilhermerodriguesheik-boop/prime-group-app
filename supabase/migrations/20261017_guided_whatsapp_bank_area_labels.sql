CREATE OR REPLACE FUNCTION public.prime_whatsapp_guided_bank_classify(p_secret text, p_event_id uuid, p_message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 owner uuid; input text; normalized text; report uuid; session_row record;
 row_number integer; chosen text; area text; area_label text;
 movement record; lines text; caption text; result jsonb;
 days_remaining interval;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_message is null or length(p_message)>150 then return jsonb_build_object('handled',false);end if;
 select p.user_id into owner from public.whatsapp_events e
 join public.whatsapp_pairings p
  on p.phone_number=regexp_replace(coalesce(e.from_number,''),'[^0-9]','','g')
    and p.enabled and p.connected_at is not null
 where e.id=p_event_id and e.status='processing' and e.message_type='text';
 if owner is null then return jsonb_build_object('handled',false);end if;

 select response into result from public.prime_bank_whatsapp_menu_replies
 where event_id=p_event_id and owner_id=owner;
 if found then return result;end if;

 input:=btrim(regexp_replace(p_message,'[[:space:]]+',' ','g'));
 normalized:=translate(lower(input),'áàãâéêíóôõúüç','aaaaeeiooouuc');

 select id into report from (
  select s.report_id as id,s.created_at from public.prime_bank_report_sessions s
  where s.owner_id=owner and s.created_at>=now()-interval '72 hours'
   and (
    (s.source='inbound' and exists (
      select 1 from public.whatsapp_events e
       where e.id=s.report_id and e.reply_sent_at is not null and e.status='processed'
         and e.from_number=(select now_event.from_number from public.whatsapp_events now_event where now_event.id=p_event_id)
    ))
    or (s.source='outbox' and exists (
      select 1 from public.prime_outbox o where o.id=s.report_id
       and o.user_id=owner and o.status='sent'
    ))
   )
  order by s.created_at desc,s.report_id desc limit 1
 ) latest;

 select * into session_row from public.prime_bank_whatsapp_menu_sessions
 where owner_id=owner for update;

 if normalized in ('classificar','classificacao','classificar extrato','classificar movimentacoes','menu bancario','menu bancos','classificar bancos','classificar banco') then
  if report is null then
   result:=jsonb_build_object('handled',true,'reply','Não encontrei um relatório bancário entregue recentemente. Envie "relatório bancário" e depois "classificar".');
  else
   insert into public.prime_bank_whatsapp_menu_sessions(owner_id,report_id,selected_ordinal,expires_at,updated_at)
   values(owner,report,null,now()+interval '30 minutes',now())
   on conflict(owner_id) do update set report_id=excluded.report_id,selected_ordinal=null,
     expires_at=excluded.expires_at,updated_at=excluded.updated_at;
   select string_agg(
     s.ordinal::text||'. '||
     case when t.direction='credit' then '+ ' else '- ' end||
     'R$ '||public.prime_format_brl(t.amount)||' | '||
     left(regexp_replace(coalesce(t.description,''),E'[\n\r]+',' ','g'),37)||
     case when cl.destination='prime' then ' [Empresa]'
          when cl.destination='personal' then ' [Pessoal]'
          when cl.destination='interest' then ' [Empréstimos]'
          when cl.destination='transfer' then ' [Transferência]'
          else '' end,
     E'\n' order by s.ordinal
   ) into lines
   from public.prime_bank_report_slots s
   join public.bank_transactions t on t.id=s.bank_transaction_id and t.owner_id=owner
   left join public.prime_bank_classifications cl on cl.bank_transaction_id=t.id and cl.user_id=owner
   where s.owner_id=owner and s.report_id=report;
   result:=jsonb_build_object('handled',true,'reply',
    'CLASSIFICAR EXTRATO'||E'\nEscolha o número da movimentação:'||E'\n\n'||
    coalesce(lines,'Nenhum lançamento neste relatório.')||
    E'\n\nResponda apenas o número (ex.: 11). Para encerrar, envie SAIR.');
  end if;
 elsif session_row.owner_id is null or session_row.expires_at<now() then
  result:=jsonb_build_object('handled',false);
 elsif session_row.report_id<>report or report is null then
  delete from public.prime_bank_whatsapp_menu_sessions where owner_id=owner;
  result:=jsonb_build_object('handled',true,
   'reply','Você recebeu outro extrato. Envie CLASSIFICAR para escolher entre os lançamentos do relatório mais recente.');
 elsif normalized in ('sair','cancelar','parar','encerrar','fim') then
  delete from public.prime_bank_whatsapp_menu_sessions where owner_id=owner;
  result:=jsonb_build_object('handled',true,
   'reply','Classificação encerrada. Nenhum outro lançamento foi alterado. Para começar novamente, envie CLASSIFICAR.');
 elsif normalized in ('menu','voltar','0') then
  update public.prime_bank_whatsapp_menu_sessions
  set selected_ordinal=null,expires_at=now()+interval '30 minutes',updated_at=now()
  where owner_id=owner;
  select string_agg(
   s.ordinal::text||'. '||
   case when t.direction='credit' then '+ ' else '- ' end||
   'R$ '||public.prime_format_brl(t.amount)||' | '||left(t.description,38)||
   case when cl.destination='prime' then ' [Empresa]'
        when cl.destination='personal' then ' [Pessoal]'
        when cl.destination='interest' then ' [Empréstimos]'
        when cl.destination='transfer' then ' [Transferência]'
        else '' end,E'\n' order by s.ordinal
  ) into lines from public.prime_bank_report_slots s
   join public.bank_transactions t on t.id=s.bank_transaction_id and t.owner_id=owner
   left join public.prime_bank_classifications cl on cl.bank_transaction_id=t.id and cl.user_id=owner
   where s.owner_id=owner and s.report_id=report;
  result:=jsonb_build_object('handled',true,'reply',
    'ESCOLHA A MOVIMENTAÇÃO'||E'\n'||coalesce(lines,'Sem lançamentos')||
    E'\n\nResponda o número ou SAIR.');
 elsif session_row.selected_ordinal is null then
  if input ~ '^[0-9]{1,2}$' and input::integer between 1 and 22 then
   row_number:=input::integer;
   select t.occurred_on,t.amount,t.description,t.direction,t.provider_status,cl.destination
   into movement from public.prime_bank_report_slots s
   join public.bank_transactions t on t.id=s.bank_transaction_id and t.owner_id=owner
   left join public.prime_bank_classifications cl on cl.bank_transaction_id=t.id and cl.user_id=owner
   where s.owner_id=owner and s.report_id=report and s.ordinal=row_number;
   if not found then
    result:=jsonb_build_object('handled',true,'reply',
     'O número '||row_number||' não está neste extrato. Envie MENU para consultar a lista.');
   else
    update public.prime_bank_whatsapp_menu_sessions set selected_ordinal=row_number,
      expires_at=now()+interval '30 minutes',updated_at=now() where owner_id=owner;
    result:=jsonb_build_object('handled',true,'reply',
     'MOVIMENTO Nº '||row_number||E'\n'||
      to_char(movement.occurred_on,'DD/MM/YYYY')||' · '||
      case when movement.direction='credit' then 'ENTRADA' else 'SAÍDA' end||
      ' R$ '||public.prime_format_brl(movement.amount)||E'\n'||
      left(movement.description,130)||
      case when movement.provider_status<>'POSTED' then E'\n[PENDENTE NO BANCO]' else '' end||
      E'\n\nONDE CLASSIFICAR?'||
      E'\n1 - Empresa'||E'\n2 - Pessoal'||E'\n3 - Empréstimos'||
      E'\n4 - Transferência'||E'\n5 - Pendente'||E'\n0 - Voltar'||
      E'\n\nResponda somente 1, 2, 3, 4 ou 5.');
   end if;
  else
   result:=jsonb_build_object('handled',false);
  end if;
 else
  chosen:=case
   when normalized in ('1','1 empresa','empresa','prime') then 'prime'
   when normalized in ('2','2 pessoal','pessoal') then 'personal'
   when normalized in ('3','3 emprestimos','3 emprestimo','emprestimos','emprestimo','juros') then 'interest'
   when normalized in ('4','4 transferencia','transferencia','transferir') then 'transfer'
   when normalized in ('5','5 pendente','pendente','nao classificado') then 'pending'
   else null end;
  if chosen is null then
   if normalized ~ '^[1-5][[:space:]]+.*$' then
    result:=jsonb_build_object('handled',true,
      'reply','Escolha a área apenas pelo número: 1 Empresa, 2 Pessoal, 3 Empréstimos, 4 Transferência, 5 Pendente.');
   else
    result:=jsonb_build_object('handled',false);
   end if;
  else
   select t.id,t.amount,t.description,t.direction,t.provider_status into movement
   from public.prime_bank_report_slots s
   join public.bank_transactions t on t.id=s.bank_transaction_id and t.owner_id=owner
   where s.owner_id=owner and s.report_id=report
    and s.ordinal=session_row.selected_ordinal for update of t;
   if not found then
    result:=jsonb_build_object('handled',true,
      'reply','A referência deste lançamento não está mais disponível. Envie CLASSIFICAR novamente.');
   else
    insert into public.prime_bank_classifications(bank_transaction_id,user_id,destination,category)
    values(movement.id,owner,chosen,null)
    on conflict(bank_transaction_id) do update set
     destination=excluded.destination,
     category=case when prime_bank_classifications.destination=excluded.destination
       then prime_bank_classifications.category else null end,
     classified_at=now();
    update public.prime_bank_whatsapp_menu_sessions
    set selected_ordinal=null,expires_at=now()+interval '30 minutes',updated_at=now()
    where owner_id=owner;
    area_label:=case chosen when 'prime' then 'Empresa'
     when 'personal' then 'Pessoal' when 'interest' then 'Empréstimos'
     when 'transfer' then 'Transferência' else 'Pendente' end;
    result:=jsonb_build_object('handled',true,'reply',
     'CLASSIFICAÇÃO SALVA'||E'\n'||
     'Nº '||session_row.selected_ordinal||' - R$ '||public.prime_format_brl(movement.amount)||
     E'\n'||left(movement.description,80)||
     E'\nÁrea: '||area_label||
     E'\n\nA classificação aparece também na tela Bancos. Não registrei pagamento, despesa nem baixa.'||
     E'\n\nPara outra movimentação, envie MENU ou o número dela. Envie SAIR para encerrar.');
   end if;
  end if;
 end if;
 if (result->>'handled')='true' then
  insert into public.prime_bank_whatsapp_menu_replies(event_id,owner_id,response)
   values(p_event_id,owner,result)
   on conflict(event_id) do nothing;
 end if;
 return result;
end $function$
;