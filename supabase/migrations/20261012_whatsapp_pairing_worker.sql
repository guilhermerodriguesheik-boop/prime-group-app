-- WhatsApp Cloud API: sender verification, durable queue, and restricted owner-scoped actions.
-- Never map an arbitrary incoming phone to a financial account without a pairing code.
create table if not exists public.whatsapp_pairings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_number text unique,
  pending_code_hash text,
  pending_until timestamptz,
  connected_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_pairing_phone_format check (
    phone_number is null or phone_number ~ '^[0-9]{10,15}$'
  )
);
alter table public.whatsapp_pairings enable row level security;
create policy whatsapp_pairing_owner_select on public.whatsapp_pairings
  for select to authenticated using (user_id=(select auth.uid()));
create policy whatsapp_pairing_owner_insert on public.whatsapp_pairings
  for insert to authenticated with check (user_id=(select auth.uid()));
create policy whatsapp_pairing_owner_update on public.whatsapp_pairings
  for update to authenticated using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));
grant select,insert,update on public.whatsapp_pairings to authenticated;

alter table public.whatsapp_events
  add column if not exists attempts integer not null default 0,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists reply_sent_at timestamptz,
  add column if not exists reply_text text,
  add column if not exists error_message text,
  add column if not exists linked_user_id uuid references auth.users(id) on delete set null;
create index if not exists whatsapp_events_work_queue_idx
  on public.whatsapp_events(status,created_at) where status in ('received','retry','processing');

alter table public.partial_records add column if not exists source_external_id text unique;

-- All server-side bridge RPCs require the same independently secret-bearing
-- token already checked by ingest_whatsapp_event; callers cannot just supply a
-- user_id or choose another person's workspace.
create or replace function public.whatsapp_bridge_authorized(p_secret text)
returns boolean language sql stable security definer
set search_path='public','private'
as $$
  select exists (
    select 1 from private.app_secrets
    where name='whatsapp_ingress'
      and secret_hash=encode(digest(coalesce(p_secret,''),'sha256'),'hex')
      and length(coalesce(p_secret,''))>=24
  );
$$;
revoke all on function public.whatsapp_bridge_authorized(text) from public,anon,authenticated;
-- Other SECURITY DEFINER functions invoke this routine as owner.

create or replace function public.whatsapp_claim_events(p_secret text,p_limit integer default 3)
returns jsonb language plpgsql security definer set search_path='public'
as $$
declare out_rows jsonb;
begin
  if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
  with claims as (
    select id from public.whatsapp_events
    where (status in ('received','retry')
       or (status='processing' and processing_started_at < now()-interval '5 minutes'))
      and attempts < 4
    order by created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit,3),1),5)
  ), updated as (
    update public.whatsapp_events e
    set status='processing',attempts=e.attempts+1,
        processing_started_at=now(),error_message=null
    where e.id in (select id from claims)
    returning e.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'providerId', provider_message_id,
    'from', from_number, 'to', to_number,
    'type', message_type, 'body', body, 'mediaId', media_id,
    'payload', payload, 'attempts', attempts
  )), '[]'::jsonb) into out_rows from updated;
  return out_rows;
end;
$$;

create or replace function public.whatsapp_pair_event(p_secret text,p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='public'
as $$
declare e public.whatsapp_events%rowtype; code text; paired uuid; sender text;
begin
  if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
  select * into e from public.whatsapp_events where id=p_event_id and status='processing' for update;
  if not found then raise exception 'event unavailable'; end if;
  sender := regexp_replace(coalesce(e.from_number,''),'[^0-9]','','g');
  if sender !~ '^[0-9]{10,15}$' then return jsonb_build_object('paired',false); end if;
  select (regexp_match(upper(btrim(coalesce(e.body,''))),'^VINCULAR[[:space:]]+([0-9]{8})$'))[1] into code;
  if code is null then return jsonb_build_object('paired',false); end if;
  select user_id into paired from public.whatsapp_pairings
    where pending_code_hash = encode(digest(code||':'||p_secret,'sha256'),'hex')
      and pending_until>now() and enabled
    for update;
  if paired is null then return jsonb_build_object('paired',false,'invalidCode',true); end if;
  if exists(select 1 from public.whatsapp_pairings where phone_number=sender and user_id<>paired) then
    return jsonb_build_object('paired',false,'alreadyLinked',true);
  end if;
  update public.whatsapp_pairings
    set phone_number=sender,pending_code_hash=null,pending_until=null,
        connected_at=now(),updated_at=now()
    where user_id=paired;
  update public.whatsapp_events set linked_user_id=paired where id=p_event_id;
  return jsonb_build_object('paired',true);
end;
$$;

create or replace function public.whatsapp_event_context(p_secret text,p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public'
as $$
declare e public.whatsapp_events%rowtype; u uuid; result jsonb;
begin
  if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
  select * into e from public.whatsapp_events
    where id=p_event_id and status='processing';
  if not found then raise exception 'event unavailable'; end if;
  select user_id into u from public.whatsapp_pairings
    where enabled and phone_number=regexp_replace(coalesce(e.from_number,''),'[^0-9]','','g');
  if u is null then return jsonb_build_object('linked',false); end if;

  select jsonb_build_object(
    'linked',true,'userId',u,
    'workspaces',coalesce((select jsonb_agg(to_jsonb(w)) from
      (select id,kind,name from public.workspaces where owner_id=u order by kind) w),'[]'::jsonb),
    'vehicles',coalesce((select jsonb_agg(to_jsonb(v)) from
      (select id,workspace_id,nickname,plate from public.vehicles
       where workspace_id in (select id from public.workspaces where owner_id=u)
       order by created_at desc limit 40) v),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(to_jsonb(a)) from
      (select workspace_id,name,institution from public.accounts
       where workspace_id in (select id from public.workspaces where owner_id=u)
       and active order by name limit 40) a),'[]'::jsonb),
    'trips',coalesce((select jsonb_agg(to_jsonb(t)) from
      (select workspace_id,origin,destination,service_date,customer_name,driver_name,
        freight_revenue,driver_cost,status
       from public.trips where workspace_id in (select id from public.workspaces where owner_id=u)
       order by created_at desc limit 30) t),'[]'::jsonb),
    'payables',coalesce((select jsonb_agg(to_jsonb(p)) from
      (select workspace_id,description,amount,due_date,paid_amount,status
       from public.payables where workspace_id in (select id from public.workspaces where owner_id=u)
       and status in ('open','partial','overdue') order by due_date limit 50) p),'[]'::jsonb),
    'receivables',coalesce((select jsonb_agg(to_jsonb(r)) from
      (select workspace_id,description,amount,due_date,received_amount,status
       from public.receivables where workspace_id in (select id from public.workspaces where owner_id=u)
       and status in ('open','partial','overdue') order by due_date limit 50) r),'[]'::jsonb),
    'recentTransactions',coalesce((select jsonb_agg(to_jsonb(t)) from
      (select workspace_id,description,type,amount,occurred_at
       from public.transactions where workspace_id in (select id from public.workspaces where owner_id=u)
       and status<>'cancelled' order by occurred_at desc limit 40) t),'[]'::jsonb),
    'lastMessages',coalesce((select jsonb_agg(to_jsonb(m)) from
      (select body,reply_text,created_at from public.whatsapp_events
       where from_number=e.from_number and status='processed'
       order by created_at desc limit 6) m),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Only owner-scoped, whitelisted operations; safe financial actions use
-- externally unique IDs based on the Meta message to prevent webhook replay.
create or replace function public.whatsapp_apply_action(
  p_secret text,p_event_id uuid,p_index integer,p_action jsonb,p_text text
) returns jsonb language plpgsql security definer set search_path='public'
as $$
declare
  e public.whatsapp_events%rowtype;
  u uuid; w uuid; kind text; op text; dedupe text; target_id uuid;
  amount numeric; vehicle_id uuid;
  date_text text; effective_date date; direction text;
begin
  if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
  if p_index is null or p_index<0 or p_index>5 then raise exception 'bad action index'; end if;
  select * into e from public.whatsapp_events where id=p_event_id and status='processing' for update;
  if not found then raise exception 'event unavailable'; end if;
  select user_id into u from public.whatsapp_pairings
    where phone_number=regexp_replace(coalesce(e.from_number,''),'[^0-9]','','g') and enabled;
  if u is null then raise exception 'sender not linked'; end if;
  op:=coalesce(p_action->>'kind','note');
  kind:=p_action->>'workspace';
  if kind is not null and kind not in ('prime','personal','interest') then
    raise exception 'invalid workspace';
  end if;
  if kind is not null then
    select id into w from public.workspaces where owner_id=u and workspaces.kind=kind;
    if w is null then raise exception 'workspace not owned'; end if;
  end if;
  dedupe := 'whatsapp:'||e.provider_message_id||':'||p_index::text;
  amount:=nullif(p_action->>'amount','')::numeric;
  date_text:=nullif(p_action->>'date','');
  effective_date:=case when date_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then date_text::date else null end;

  if op='transaction' and w is not null and amount>0
     and effective_date is not null and length(btrim(coalesce(p_action->>'description','')))>1
     and p_action->>'direction' in ('income','expense')
     and coalesce(p_action->>'certainty','')='confirmed' then
    direction:=p_action->>'direction';
    select id into target_id from public.transactions
      where workspace_id=w and source='whatsapp' and external_id=dedupe;
    if target_id is null then
      insert into public.transactions(workspace_id,type,amount,description,occurred_at,
        status,source,external_id,created_by)
      values (w,direction,round(amount,2),left(p_action->>'description',500),
        (effective_date::text||' 12:00:00-03')::timestamptz,
        'posted','whatsapp',dedupe,u)
      returning id into target_id;
    end if;
    return jsonb_build_object('saved',true,'kind','transaction','id',target_id,
      'workspace',kind,'amount',amount,'direction',direction);
  elsif op='trip' and w is not null and kind='prime' then
    -- Preserve partial trip data, but do not book freight or driver's payment
    -- as received/paid. Client and driver are free-text fields.
    select id into target_id from public.whatsapp_action_receipts
      where external_id=dedupe;
    if target_id is not null then
      return jsonb_build_object('saved',true,'kind','trip','reused',true);
    end if;
    insert into public.trips(workspace_id,origin,destination,service_date,
      customer_name,driver_name,driver_cost,freight_revenue,distance_km,reference,status)
    values(w,nullif(left(p_action->>'origin',200),''),
      nullif(left(p_action->>'destination',200),''),
      effective_date,nullif(left(p_action->>'customer',200),''),
      nullif(left(p_action->>'driver',200),''),
      nullif(p_action->>'driverCost','')::numeric,
      nullif(p_action->>'freightValue','')::numeric,
      nullif(p_action->>'distanceKm','')::numeric,
      nullif(left(p_action->>'reference',150),''),
      'planned')
    returning id into target_id;
    insert into public.whatsapp_action_receipts(external_id,event_id,kind,record_id)
      values(dedupe,p_event_id,'trip',target_id);
    return jsonb_build_object('saved',true,'kind','trip','id',target_id,
      'workspace',kind,'note','Frete cadastrado, sem baixa financeira');
  end if;

  -- Anything incomplete or unclear is a NOTE, not a fabricated payment.
  select id into target_id from public.partial_records where source_external_id=dedupe;
  if target_id is null then
    insert into public.partial_records(user_id,workspace_id,subject,original_text,
      extracted_data,record_kind,source_external_id)
    values(u,w,left(coalesce(nullif(p_action->>'description',''),'Mensagem do WhatsApp'),160),
      left(coalesce(nullif(p_text,''),'[Mídia do WhatsApp sem texto]'),8000),
      jsonb_build_object('provider_message_id',e.provider_message_id,'suggested_action',p_action),
      case when op in ('transaction','trip','loan','expense','income') then
        case when op='trip' then 'trip' when op='loan' then 'loan'
          when op='income' then 'income' else 'expense' end
      else 'other' end,
      dedupe)
    returning id into target_id;
  end if;
  return jsonb_build_object('saved',true,'kind','partial','id',target_id,
    'workspace',kind,'note','Anotação guardada; não alterou o caixa');
end;
$$;

create table if not exists public.whatsapp_action_receipts (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  event_id uuid not null references public.whatsapp_events(id) on delete cascade,
  kind text not null,
  record_id uuid,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_action_receipts enable row level security;

create or replace function public.whatsapp_finish_event(
  p_secret text,p_event_id uuid,p_state text,p_reply text default null,p_error text default null
) returns boolean language plpgsql security definer set search_path='public'
as $$
begin
  if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
  if p_state not in ('processed','retry','ignored','failed') then raise exception 'invalid state'; end if;
  update public.whatsapp_events
    set status=p_state,processed_at=case when p_state in ('processed','ignored') then now() else null end,
        reply_text=left(p_reply,4000),error_message=left(p_error,500)
  where id=p_event_id and status='processing';
  return found;
end;
$$;
create or replace function public.whatsapp_mark_reply_sent(p_secret text,p_event_id uuid)
returns boolean language plpgsql security definer set search_path='public'
as $$
begin
  if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
  update public.whatsapp_events set reply_sent_at=now() where id=p_event_id and reply_text is not null;
  return found;
end;
$$;

revoke all on function public.whatsapp_claim_events(text,integer) from public,authenticated;
revoke all on function public.whatsapp_pair_event(text,uuid) from public,authenticated;
revoke all on function public.whatsapp_event_context(text,uuid) from public,authenticated;
revoke all on function public.whatsapp_apply_action(text,uuid,integer,jsonb,text) from public,authenticated;
revoke all on function public.whatsapp_finish_event(text,uuid,text,text,text) from public,authenticated;
revoke all on function public.whatsapp_mark_reply_sent(text,uuid) from public,authenticated;
grant execute on function public.whatsapp_claim_events(text,integer) to anon;
grant execute on function public.whatsapp_pair_event(text,uuid) to anon;
grant execute on function public.whatsapp_event_context(text,uuid) to anon;
grant execute on function public.whatsapp_apply_action(text,uuid,integer,jsonb,text) to anon;
grant execute on function public.whatsapp_finish_event(text,uuid,text,text,text) to anon;
grant execute on function public.whatsapp_mark_reply_sent(text,uuid) to anon;
