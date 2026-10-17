
create table if not exists public.prime_bank_report_sessions (
 owner_id uuid not null references auth.users(id) on delete cascade,
 report_id uuid not null,
 source text not null check(source in ('inbound','outbox')),
 created_at timestamptz not null default now(),
 primary key(owner_id,report_id)
);
create index if not exists prime_bank_report_sessions_recent
 on public.prime_bank_report_sessions(owner_id,created_at desc);
alter table public.prime_bank_report_sessions enable row level security;
create policy "Owner can inspect bank report sessions"
 on public.prime_bank_report_sessions for select to authenticated
 using(owner_id=(select auth.uid()));
grant select on public.prime_bank_report_sessions to authenticated;

CREATE OR REPLACE FUNCTION public.prime_capture_bank_report_slots(p_owner uuid, p_report_id uuid, p_source text, p_mode text, p_report_text text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer:=0; day_local date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if p_owner is null or p_report_id is null or p_source not in ('inbound','outbox')
    or p_mode not in ('imported_today','today','yesterday','yesterday_today','last7') then
  raise exception 'Parâmetros do relatório inválidos';
 end if;
 if p_source='inbound' and not exists (
  select 1 from public.whatsapp_events e join public.whatsapp_pairings p
    on p.phone_number=regexp_replace(coalesce(e.from_number,''),'[^0-9]','','g')
    and p.user_id=p_owner and p.connected_at is not null and p.enabled
  where e.id=p_report_id and e.status='processing'
 ) then raise exception 'Relatório WhatsApp não autorizado'; end if;
 if p_source='outbox' and not exists (
  select 1 from public.prime_outbox o where o.id=p_report_id and o.user_id=p_owner
 ) then raise exception 'Fila de relatório não autorizada'; end if;
 insert into public.prime_bank_report_sessions(owner_id,report_id,source)
 values(p_owner,p_report_id,p_source)
 on conflict(owner_id,report_id) do nothing;
 delete from public.prime_bank_report_slots
 where owner_id=p_owner and report_id=p_report_id;
 with numbered as (
  select t.id,row_number() over(order by t.occurred_on desc,t.created_at desc,t.id desc) as rn
  from public.bank_transactions t
  join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=p_owner
  join public.bank_connections c on c.id=a.connection_id and c.owner_id=p_owner and c.archived_at is null
  join public.workspaces w on w.id=t.workspace_id and w.owner_id=p_owner and w.id=a.workspace_id
  where t.owner_id=p_owner and a.kind='BANK' and a.currency='BRL'
  and (case p_mode
    when 'imported_today' then (t.created_at at time zone 'America/Sao_Paulo')::date=day_local
    when 'today' then t.occurred_on=day_local
    when 'yesterday' then t.occurred_on=day_local-1
    when 'yesterday_today' then t.occurred_on between day_local-1 and day_local
    else t.occurred_on between day_local-6 and day_local end)
 )
 insert into public.prime_bank_report_slots(owner_id,report_id,source,ordinal,bank_transaction_id)
 select p_owner,p_report_id,p_source,rn::smallint,id from numbered
 where rn<=18 and position(E'\n'||rn::text||'. ' in p_report_text)>0;
 get diagnostics n=row_count;
 return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.prime_whatsapp_classify_bank_by_number(p_secret text, p_event_id uuid, p_number integer, p_destination text, p_category text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare owner uuid; linked_report uuid; bank uuid; movement record; label text;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_number not between 1 and 22 or p_destination not in ('prime','personal','interest','transfer','pending')
    or length(coalesce(p_category,''))>80 then
  return jsonb_build_object('ok',false,'reason','invalid');end if;
 select wp.user_id into owner
 from public.whatsapp_events e join public.whatsapp_pairings wp
  on wp.phone_number=regexp_replace(coalesce(e.from_number,''),'[^0-9]','','g')
   and wp.enabled and wp.connected_at is not null
 where e.id=p_event_id and e.status='processing' and e.message_type='text';
 if owner is null then return jsonb_build_object('ok',false,'reason','unauthorized');end if;
 select s.report_id into linked_report from public.prime_bank_report_sessions s
 where s.owner_id=owner and s.created_at>=now()-interval '72 hours'
  and ((s.source='inbound' and exists(
    select 1 from public.whatsapp_events e
    where e.id=s.report_id and e.reply_sent_at is not null
     and e.from_number=(select request.from_number from public.whatsapp_events request where request.id=p_event_id)))
   or (s.source='outbox' and exists(
    select 1 from public.prime_outbox o
    where o.id=s.report_id and o.user_id=owner and o.status='sent')))
 order by s.created_at desc,s.report_id desc limit 1;
 if linked_report is null then return jsonb_build_object('ok',false,'reason','no_report');end if;
 select s.bank_transaction_id into bank from public.prime_bank_report_slots s
 where s.owner_id=owner and s.report_id=linked_report and s.ordinal=p_number;
 if bank is null then return jsonb_build_object('ok',false,'reason','number_not_found');end if;
 select t.id,t.owner_id,t.workspace_id,t.amount,t.direction,t.description,t.provider_status
 into movement from public.bank_transactions t
 join public.workspaces w on w.id=t.workspace_id and w.owner_id=t.owner_id
 where t.id=bank and t.owner_id=owner for update of t;
 if not found then return jsonb_build_object('ok',false,'reason','not_found');end if;
 label:=nullif(left(btrim(coalesce(p_category,'')),80),'');
 insert into public.prime_bank_classifications(bank_transaction_id,user_id,destination,category)
 values(bank,owner,p_destination,label)
 on conflict(bank_transaction_id) do update set
 destination=excluded.destination,category=excluded.category,classified_at=now();
 return jsonb_build_object('ok',true,'number',p_number,
  'destination',p_destination,'category',label,'amount',movement.amount,
  'direction',movement.direction,'description',left(movement.description,75));
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
    'Sugestoes nao representam conciliacao ou pagamento confirmado.';
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