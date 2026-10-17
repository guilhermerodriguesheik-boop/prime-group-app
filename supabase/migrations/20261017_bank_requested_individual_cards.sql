-- One interactive WhatsApp message per REAL bank movement in a requested period.
-- This is a read-only report queue; the only write is to the WhatsApp outbox.
create or replace function public.prime_queue_requested_bank_cards(
 p_secret text,p_owner_id uuid,p_mode text default 'imported_today',
 p_event_id uuid default null,p_limit integer default 35
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $cards$
declare
 day_local date:=(now() at time zone 'America/Sao_Paulo')::date;
 request_key text; item record; message_id uuid;
 total_count integer:=0; queued_count integer:=0; already_count integer:=0;
 batch_limit integer:=least(greatest(coalesce(p_limit,35),1),35);
begin
 if not public.whatsapp_bridge_authorized(p_secret) then
  raise exception 'unauthorized';
 end if;
 if p_mode not in ('imported_today','today','yesterday','yesterday_today','last7') then
  raise exception 'Período inválido';
 end if;
 if not exists (
  select 1 from public.whatsapp_pairings p
  where p.user_id=p_owner_id and p.enabled and p.connected_at is not null
   and p.phone_number~'^[0-9]{10,15}$'
 ) then raise exception 'WhatsApp não está vinculado';end if;
 if p_event_id is not null and not exists(
  select 1 from public.whatsapp_events e
  join public.whatsapp_pairings pair
   on pair.phone_number=regexp_replace(coalesce(e.from_number,''),'[^0-9]','','g')
    and pair.user_id=p_owner_id and pair.enabled and pair.connected_at is not null
  where e.id=p_event_id and e.status='processing' and e.message_type='text'
 ) then raise exception 'Mensagem WhatsApp não autorizada';end if;

 -- A retried inbound event never creates duplicate notifications, regardless of time.
 request_key:=case when p_event_id is not null
  then 'event:'||p_event_id::text
  else 'app:'||floor(extract(epoch from now())/300)::bigint::text
 end;

 select count(*) into total_count
 from public.bank_transactions t
 join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=p_owner_id
 join public.bank_connections c on c.id=a.connection_id and c.owner_id=p_owner_id and c.archived_at is null
 join public.workspaces w on w.id=t.workspace_id and w.id=a.workspace_id and w.owner_id=p_owner_id
 where t.owner_id=p_owner_id and a.kind='BANK' and a.currency='BRL'
 and t.amount>0 and (case p_mode
  when 'imported_today' then (t.created_at at time zone 'America/Sao_Paulo')::date=day_local
  when 'today' then t.occurred_on=day_local
  when 'yesterday' then t.occurred_on=day_local-1
  when 'yesterday_today' then t.occurred_on between day_local-1 and day_local
  else t.occurred_on between day_local-6 and day_local end);

 for item in
  select t.id,t.occurred_on,t.amount,t.direction,t.description,t.provider_status,
    a.display_name as account_name,w.kind as workspace_kind
  from public.bank_transactions t
  join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=p_owner_id
  join public.bank_connections c on c.id=a.connection_id and c.owner_id=p_owner_id and c.archived_at is null
  join public.workspaces w on w.id=t.workspace_id and w.id=a.workspace_id and w.owner_id=p_owner_id
  where t.owner_id=p_owner_id and a.kind='BANK' and a.currency='BRL'
   and t.amount>0 and (case p_mode
    when 'imported_today' then (t.created_at at time zone 'America/Sao_Paulo')::date=day_local
    when 'today' then t.occurred_on=day_local
    when 'yesterday' then t.occurred_on=day_local-1
    when 'yesterday_today' then t.occurred_on between day_local-1 and day_local
    else t.occurred_on between day_local-6 and day_local end)
  order by t.occurred_on desc,t.created_at desc,t.id desc
  limit batch_limit
 loop
  message_id:=null;
  insert into public.prime_outbox(
   user_id,dedupe_key,category,reference,bank_transaction_id,message
  ) values (
   p_owner_id,
   'bank-report-card:'||request_key||':'||p_mode||':'||item.id::text,
   'bank',to_char(item.occurred_on,'YYYYMMDD'),item.id,
   case when item.direction='credit' then 'ENTRADA' else 'SAÍDA' end||
    ' · R$ '||public.prime_format_brl(item.amount)||E'\n'||
    left(regexp_replace(coalesce(item.account_name,'Banco'),E'[\r\n]+',' ','g'),28)||
    ' · '||to_char(item.occurred_on,'DD/MM')||
    case when item.workspace_kind='personal' then ' · Pessoal' else ' · Empresa' end||
    E'\n'||left(regexp_replace(coalesce(item.description,''),E'[\r\n]+',' ','g'),70)||
    case when item.provider_status<>'POSTED' then E'\n[PENDENTE NO BANCO]' else '' end
  )
  on conflict(dedupe_key) do nothing returning id into message_id;
  if message_id is not null then
   queued_count:=queued_count+1;
  else
   already_count:=already_count+1;
  end if;
 end loop;
 return jsonb_build_object(
  'ok',true,'total',total_count,'selected',least(total_count,batch_limit),
  'queued',queued_count,'alreadyQueued',already_count,
  'truncated',total_count>batch_limit,'limit',batch_limit
 );
end $cards$;
revoke all on function public.prime_queue_requested_bank_cards(text,uuid,text,uuid,integer)
 from public,authenticated;
grant execute on function public.prime_queue_requested_bank_cards(text,uuid,text,uuid,integer) to anon;
