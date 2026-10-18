-- Minimal diagnostic for an authenticated poll vote (no contents, sender number or vote choice).
create table if not exists public.prime_bank_poll_ingress_audit (
 poll_id text not null references public.prime_bank_poll_links(poll_id) on delete cascade,
 stage text not null check(stage in ('received','no_phone_identity','unknown_owner','decrypt_failed','saved','save_failed')),
 first_at timestamptz not null default now(),
 last_at timestamptz not null default now(),
 occurrences integer not null default 1,
 primary key(poll_id,stage)
);
alter table public.prime_bank_poll_ingress_audit enable row level security;
revoke all on public.prime_bank_poll_ingress_audit from anon,authenticated;
create or replace function public.prime_bank_poll_ingress_stage(p_secret text,p_poll_id text,p_stage text)
returns boolean language plpgsql security definer set search_path=public,pg_temp
as $$
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_stage not in ('received','no_phone_identity','unknown_owner','decrypt_failed','saved','save_failed')
  then return false;end if;
 insert into public.prime_bank_poll_ingress_audit(poll_id,stage)
 select p.poll_id,p_stage from public.prime_bank_poll_links p where p.poll_id=p_poll_id
 on conflict(poll_id,stage) do update set last_at=now(),
  occurrences=public.prime_bank_poll_ingress_audit.occurrences+1;
 return found;
end $$;
revoke all on function public.prime_bank_poll_ingress_stage(text,text,text) from public,authenticated;
grant execute on function public.prime_bank_poll_ingress_stage(text,text,text) to anon;
