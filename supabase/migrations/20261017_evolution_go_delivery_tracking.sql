-- Separate provider acceptance from actual WhatsApp delivery/read confirmation.
alter table public.prime_outbox
 add column if not exists provider_message_id text,
 add column if not exists provider_delivery_status text,
 add column if not exists provider_status_checked_at timestamptz;
create unique index if not exists prime_outbox_provider_message_id_idx
 on public.prime_outbox (provider_message_id) where provider_message_id is not null;
alter table public.prime_outbox drop constraint if exists prime_outbox_delivery_status_check;
alter table public.prime_outbox add constraint prime_outbox_delivery_status_check
 check (provider_delivery_status is null or provider_delivery_status in
  ('accepted','sent','delivered','read','unavailable'));

create or replace function public.prime_finish_outbox_with_provider(
 p_secret text,p_id uuid,p_provider_message_id text
) returns boolean language plpgsql security definer set search_path=public,pg_temp
as $fn$
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 if p_provider_message_id is null or p_provider_message_id !~ '^[A-Za-z0-9_-]{8,150}$'
  then raise exception 'invalid_provider_id'; end if;
 update public.prime_outbox set status='sent',sent_at=now(),
  processing_started_at=null,last_error=null,
  provider_message_id=p_provider_message_id,provider_delivery_status='accepted',
  provider_status_checked_at=null
 where id=p_id and category='bank' and status='processing' and bank_transaction_id is not null;
 return found;
end $fn$;

create or replace function public.prime_update_outbox_delivery_status(
 p_secret text,p_id uuid,p_provider_message_id text,p_status text
) returns boolean language plpgsql security definer set search_path=public,pg_temp
as $fn$
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 if p_status not in ('accepted','sent','delivered','read','unavailable') then
  raise exception 'invalid_delivery_status';end if;
 update public.prime_outbox o set
  provider_delivery_status=case
    when p_status='unavailable' and o.provider_delivery_status in ('accepted','unavailable')
      then 'unavailable'
    when p_status='unavailable' then o.provider_delivery_status
    when coalesce(array_position(array['accepted','unavailable','sent','delivered','read'],p_status),0)
     > coalesce(array_position(array['accepted','unavailable','sent','delivered','read'],o.provider_delivery_status),0)
      then p_status
    else o.provider_delivery_status end,
  provider_status_checked_at=now()
 where o.id=p_id and o.provider_message_id=p_provider_message_id and o.category='bank' and o.status='sent';
 return found;
end $fn$;

create or replace function public.prime_get_outbox_delivery_checks(
 p_secret text,p_limit integer default 16
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare result jsonb;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'providerId',s.provider_message_id)),'[]'::jsonb)
 into result from (
  select id,provider_message_id from public.prime_outbox
  where category='bank' and status='sent' and provider_message_id is not null
    and provider_delivery_status not in ('read','delivered')
    and sent_at > now()-interval '48 hours'
    and (provider_status_checked_at is null or
      provider_status_checked_at < now()-interval '5 minutes')
  order by coalesce(provider_status_checked_at,sent_at),sent_at
  limit least(greatest(coalesce(p_limit,16),1),30)
 ) s;
 return result;
end $fn$;
revoke all on function public.prime_finish_outbox_with_provider(text,uuid,text) from public,authenticated;
revoke all on function public.prime_update_outbox_delivery_status(text,uuid,text,text) from public,authenticated;
revoke all on function public.prime_get_outbox_delivery_checks(text,integer) from public,authenticated;
grant execute on function public.prime_finish_outbox_with_provider(text,uuid,text) to anon;
grant execute on function public.prime_update_outbox_delivery_status(text,uuid,text,text) to anon;
grant execute on function public.prime_get_outbox_delivery_checks(text,integer) to anon;
