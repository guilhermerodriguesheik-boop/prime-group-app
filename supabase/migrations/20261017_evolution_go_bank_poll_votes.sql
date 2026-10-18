-- Inbound poll votes are encrypted end-to-end. Store the server-generated
-- messageSecret and associate it only with a WhatsApp-linked bank outbox.
create table if not exists public.prime_bank_poll_links(
 outbox_id uuid primary key references public.prime_outbox(id) on delete cascade,
 poll_id text not null unique,
 message_secret text not null,
 sender_jid text not null,
 created_at timestamptz not null default now(),
 last_vote_message_id text,
 last_vote_time timestamptz
);
alter table public.prime_bank_poll_links enable row level security;
revoke all on public.prime_bank_poll_links from anon,authenticated;

create or replace function public.prime_register_bank_poll(
 p_secret text,p_outbox_id uuid,p_poll_id text,p_message_secret text,p_sender_jid text
) returns boolean language plpgsql security definer set search_path=public,pg_temp
as $fn$
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_poll_id !~ '^[A-Za-z0-9_-]{8,150}$' or p_sender_jid !~ '^[0-9]{10,15}@s[.]whatsapp[.]net$'
  or length(p_message_secret)>120 or length(p_message_secret)<40
 then return false;end if;
 if (select length(decode(p_message_secret,'base64')))<>32 then return false;end if;
 insert into public.prime_bank_poll_links(outbox_id,poll_id,message_secret,sender_jid)
 select o.id,p_poll_id,p_message_secret,p_sender_jid from public.prime_outbox o
 where o.id=p_outbox_id and o.category='bank' and o.status='processing'
  and o.bank_transaction_id is not null
 on conflict (outbox_id) do nothing;
 return found;
exception when others then return false;
end $fn$;

create or replace function public.prime_get_bank_poll_vote(
 p_secret text,p_poll_id text,p_phone text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare payload jsonb;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_phone !~ '^[0-9]{10,15}$' then return null;end if;
 select jsonb_build_object('pollId',p.poll_id,'secret',p.message_secret,
    'senderJid',p.sender_jid)
 into payload
 from public.prime_bank_poll_links p
 join public.prime_outbox o on o.id=p.outbox_id
 join public.whatsapp_pairings pair on pair.user_id=o.user_id
 where p.poll_id=p_poll_id and o.category='bank'
 and o.status='sent' and o.sent_at>now()-interval '72 hours'
 and pair.phone_number=p_phone and pair.enabled and pair.connected_at is not null;
 return payload;
end $fn$;

create or replace function public.prime_apply_bank_poll_vote(
 p_secret text,p_poll_id text,p_phone text,p_vote_message_id text,p_destination text
) returns boolean language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare card_id uuid; movement uuid; owner uuid;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_destination not in ('prime','personal','interest','transfer','pending')
    or p_vote_message_id !~ '^[A-Za-z0-9_-]{8,150}$' then return false;end if;
 select o.id,o.bank_transaction_id,o.user_id into card_id,movement,owner
 from public.prime_bank_poll_links p
 join public.prime_outbox o on o.id=p.outbox_id
 join public.whatsapp_pairings pair on pair.user_id=o.user_id
 where p.poll_id=p_poll_id and o.category='bank' and o.status='sent'
 and p.created_at>now()-interval '72 hours'
 and pair.phone_number=p_phone and pair.enabled and pair.connected_at is not null
 for update of p;
 if card_id is null then return false;end if;
 if exists(select 1 from public.prime_bank_poll_links
  where outbox_id=card_id and last_vote_message_id=p_vote_message_id)
 then return true;end if;
 insert into public.prime_bank_classifications(bank_transaction_id,user_id,destination,category,classified_at)
 values(movement,owner,p_destination,null,now())
 on conflict(bank_transaction_id) do update set
 destination=excluded.destination,classified_at=now();
 update public.prime_bank_poll_links set last_vote_message_id=p_vote_message_id,
 last_vote_time=now() where outbox_id=card_id;
 return true;
end $fn$;
revoke all on function public.prime_register_bank_poll(text,uuid,text,text,text) from public,authenticated;
revoke all on function public.prime_get_bank_poll_vote(text,text,text) from public,authenticated;
revoke all on function public.prime_apply_bank_poll_vote(text,text,text,text,text) from public,authenticated;
grant execute on function public.prime_register_bank_poll(text,uuid,text,text,text) to anon;
grant execute on function public.prime_get_bank_poll_vote(text,text,text) to anon;
grant execute on function public.prime_apply_bank_poll_vote(text,text,text,text,text) to anon;
