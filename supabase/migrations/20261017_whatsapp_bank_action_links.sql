-- Only the server bridge may read/update a bank card; public actions require an
-- HMAC-signed short-lived outbox URL verified by the Next.js server first.
create or replace function public.prime_get_bank_action_card(p_secret text,p_outbox_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare result jsonb;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 select jsonb_build_object(
  'ok',true,'amount',t.amount,'direction',t.direction,'description',left(t.description,160),
  'occurredOn',t.occurred_on,'account',left(a.display_name,70),
  'destination',coalesce(c.destination,'pending'),
  'pendingBank',coalesce(t.provider_status,'') <> 'POSTED'
 ) into result
 from public.prime_outbox o
 join public.bank_transactions t on t.id=o.bank_transaction_id and t.owner_id=o.user_id
 join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=o.user_id
 left join public.prime_bank_classifications c on c.bank_transaction_id=t.id and c.user_id=o.user_id
 where o.id=p_outbox_id and o.category='bank'
  and o.status in ('processing','sent')
  and o.created_at>now()-interval '4 days';
 return coalesce(result,'{"ok":false}'::jsonb);
end;
$$;

create or replace function public.prime_choose_bank_action_area(
 p_secret text,p_outbox_id uuid,p_destination text)
returns boolean language plpgsql security definer set search_path=public,pg_temp
as $$
declare tx_id uuid; owner_id uuid;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 if p_destination not in ('prime','personal','interest','transfer','pending') then return false; end if;
 select o.bank_transaction_id,o.user_id into tx_id,owner_id
 from public.prime_outbox o
 join public.bank_transactions t on t.id=o.bank_transaction_id and t.owner_id=o.user_id
 where o.id=p_outbox_id and o.category='bank'
 and o.status in ('processing','sent')
 and o.created_at>now()-interval '4 days';
 if tx_id is null then return false; end if;
 insert into public.prime_bank_classifications(bank_transaction_id,user_id,destination,category,classified_at)
 values(tx_id,owner_id,p_destination,null,now())
 on conflict(bank_transaction_id) do update set
  destination=excluded.destination,classified_at=now();
 return true;
end;
$$;
revoke all on function public.prime_get_bank_action_card(text,uuid) from public,authenticated;
revoke all on function public.prime_choose_bank_action_area(text,uuid,text) from public,authenticated;
grant execute on function public.prime_get_bank_action_card(text,uuid) to anon;
grant execute on function public.prime_choose_bank_action_area(text,uuid,text) to anon;
