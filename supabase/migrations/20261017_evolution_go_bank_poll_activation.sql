-- Turn on poll classification for full bank reports only after one
-- real owner vote is decrypted and successfully written to Supabase.
create or replace function public.prime_bank_native_polls_ready(p_secret text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $fn$
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 return exists(select 1 from public.prime_bank_poll_links p
  join public.prime_outbox o on o.id=p.outbox_id
  where o.dedupe_key like 'bank-poll-pilot:%'
  and p.last_vote_message_id is not null
  and p.created_at>now()-interval '30 days');
end $fn$;
revoke all on function public.prime_bank_native_polls_ready(text) from public,authenticated;
grant execute on function public.prime_bank_native_polls_ready(text) to anon;
