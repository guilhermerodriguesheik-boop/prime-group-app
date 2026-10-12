-- Limit OpenAI calls that arrive from a paired WhatsApp number;
-- this does not rely on mutable request-body metadata.
create or replace function public.whatsapp_usage_within_limit(
  p_secret text,p_event_id uuid,p_daily_limit integer default 60
) returns boolean
language plpgsql stable security definer set search_path='public'
as $$
declare sender text; total integer;
begin
  if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
  select from_number into sender from public.whatsapp_events
    where id=p_event_id and status='processing';
  if sender is null then return false; end if;
  if not exists (select 1 from public.whatsapp_pairings
    where phone_number=regexp_replace(sender,'[^0-9]','','g') and enabled) then
    return false;
  end if;
  select count(*) into total from public.whatsapp_events
    where from_number=sender and created_at>=now()-interval '24 hours'
      and status in ('processed','processing');
  return total<=least(greatest(coalesce(p_daily_limit,60),5),500);
end;
$$;
revoke all on function public.whatsapp_usage_within_limit(text,uuid,integer) from public,authenticated;
grant execute on function public.whatsapp_usage_within_limit(text,uuid,integer) to anon;
