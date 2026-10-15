-- Durable incoming Pluggy webhook inbox. Do not ACK events before they are stored.
create table if not exists public.prime_pluggy_events (
 event_id uuid primary key,
 item_id uuid not null,
 event_kind text not null check(event_kind in ('item/updated','transactions/created')),
 status text not null default 'pending' check(status in('pending','processing','retry','done','failed')),
 attempts int not null default 0,
 processing_started_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table public.prime_pluggy_events enable row level security;
create index if not exists prime_pluggy_event_claim_idx on public.prime_pluggy_events(status,created_at);
-- No direct user grants: only server-side, signed security-definer RPCs can touch this inbox.

create or replace function public.prime_enqueue_pluggy_event(
 p_secret text,p_event_id uuid,p_item_id uuid,p_kind text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_kind not in ('item/updated','transactions/created') then return false;end if;
 if not exists(select 1 from public.bank_connections c where c.provider='pluggy'
   and c.provider_item_id=p_item_id::text and c.archived_at is null and c.status<>'disconnected') then
   return false;
 end if;
 insert into public.prime_pluggy_events(event_id,item_id,event_kind)
 values(p_event_id,p_item_id,p_kind) on conflict(event_id) do nothing;
 return true;
end $$;
create or replace function public.prime_claim_pluggy_events(p_secret text,p_limit int default 2)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 with next_events as (
  select e.event_id from public.prime_pluggy_events e
  where e.attempts<5 and
   (e.status in('pending','retry') or(e.status='processing' and e.processing_started_at<now()-interval '5 minutes'))
  order by e.created_at for update of e skip locked
  limit least(greatest(coalesce(p_limit,2),1),5)
 ),claimed as(
  update public.prime_pluggy_events e
  set status='processing',attempts=e.attempts+1,processing_started_at=now(),last_error=null
  where e.event_id in(select event_id from next_events) returning e.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',event_id,'itemId',item_id,'event',event_kind)),'[]'::jsonb) into result
 from claimed;
 return result;
end $$;
create or replace function public.prime_finish_pluggy_event(p_secret text,p_event_id uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 update public.prime_pluggy_events set
 status=case when p_success then 'done' when attempts>=5 then 'failed' else 'retry' end,
 completed_at=case when p_success then now() else null end,
 processing_started_at=null,last_error=case when p_success then null else left(coalesce(p_error,'Unknown bank error'),180) end
 where event_id=p_event_id and status='processing';
 return found;
end $$;
revoke all on function public.prime_enqueue_pluggy_event(text,uuid,uuid,text) from public;
revoke all on function public.prime_claim_pluggy_events(text,int) from public;
revoke all on function public.prime_finish_pluggy_event(text,uuid,boolean,text) from public;
grant execute on function public.prime_enqueue_pluggy_event(text,uuid,uuid,text) to anon,authenticated;
grant execute on function public.prime_claim_pluggy_events(text,int) to anon,authenticated;
grant execute on function public.prime_finish_pluggy_event(text,uuid,boolean,text) to anon,authenticated;
notify pgrst,'reload schema';
