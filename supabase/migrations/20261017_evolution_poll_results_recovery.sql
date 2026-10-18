-- Optional provider-side recovery when a poll update was never forwarded
-- to our webhook. Only exposes owner-bound poll IDs to the authenticated bridge.
create or replace function public.prime_get_unresolved_bank_polls(
 p_secret text,p_limit integer default 3)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare result jsonb;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'pollId',x.poll_id,'phone',x.phone_number)), '[]'::jsonb) into result
 from (select p.poll_id,pair.phone_number
  from public.prime_bank_poll_links p
  join public.prime_outbox o on o.id=p.outbox_id
  join public.whatsapp_pairings pair on pair.user_id=o.user_id
  where o.status='sent' and o.category='bank'
   and p.last_vote_message_id is null and p.created_at>now()-interval '72 hours'
   and pair.enabled and pair.connected_at is not null
   and pair.phone_number ~ '^[0-9]{10,15}$'
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit,3),1),5)
 ) x;
 return result;
end $$;
revoke all on function public.prime_get_unresolved_bank_polls(text,integer) from public,authenticated;
grant execute on function public.prime_get_unresolved_bank_polls(text,integer) to anon;
