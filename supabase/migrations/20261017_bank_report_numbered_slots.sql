
create table if not exists public.prime_bank_report_slots (
 owner_id uuid not null references auth.users(id) on delete cascade,
 report_id uuid not null,
 source text not null check(source in ('inbound','outbox')),
 ordinal smallint not null check(ordinal between 1 and 22),
 bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(owner_id,report_id,ordinal)
);
create index if not exists prime_bank_report_slots_recent
 on public.prime_bank_report_slots(owner_id,created_at desc);
alter table public.prime_bank_report_slots enable row level security;
create policy "Owner can inspect bank report references" on public.prime_bank_report_slots
 for select to authenticated using(owner_id=(select auth.uid()));
grant select on public.prime_bank_report_slots to authenticated;

create or replace function public.prime_capture_bank_report_slots(
 p_owner uuid,p_report_id uuid,p_source text,p_mode text,p_report_text text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
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
end $$;
revoke all on function public.prime_capture_bank_report_slots(uuid,uuid,text,text,text) from public,anon,authenticated;

create or replace function public.prime_whatsapp_classify_bank_by_number(
 p_secret text,p_event_id uuid,p_number integer,p_destination text,p_category text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
 select s.report_id into linked_report from public.prime_bank_report_slots s
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
end $$;
revoke all on function public.prime_whatsapp_classify_bank_by_number(text,uuid,integer,text,text)
 from public,authenticated;
grant execute on function public.prime_whatsapp_classify_bank_by_number(text,uuid,integer,text,text) to anon;
