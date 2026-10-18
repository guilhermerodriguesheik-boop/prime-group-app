CREATE OR REPLACE FUNCTION public.prime_whatsapp_classify_bank(p_secret text, p_event_id uuid, p_reference text, p_destination text, p_category text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare owner uuid; bank_tx uuid;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_destination not in ('prime','personal','interest','transfer','pending')
    or p_reference !~ '^[A-F0-9]{8}$' or length(coalesce(p_category,''))>80 then return false;end if;
 select wp.user_id into owner from public.whatsapp_events e
  join public.whatsapp_pairings wp on wp.phone_number=regexp_replace(coalesce(e.from_number,''),'[^0-9]','','g')
   and wp.enabled and wp.connected_at is not null
 where e.id=p_event_id and e.status='processing';
 if owner is null then return false;end if;
 -- A bank-card text receipt shows the first 8 characters of the outbox UUID.
 -- Resolve strictly to a card that was sent to this authenticated phone owner.
 select o.bank_transaction_id into bank_tx from public.prime_outbox o
 where o.user_id=owner and o.category='bank'
  and o.bank_transaction_id is not null
  and o.status='sent' and o.sent_at>now()-interval '30 days'
  and upper(left(o.id::text,8))=p_reference
 order by o.sent_at desc limit 1;
 if bank_tx is null then
  -- Preserve the original reference-based classification for older messages.
  select o.bank_transaction_id into bank_tx from public.prime_outbox o
  where o.user_id=owner and o.reference=p_reference and o.category='bank'
  order by o.sent_at desc nulls last limit 1;
 end if;
 if bank_tx is null then return false;end if;
 insert into public.prime_bank_classifications(bank_transaction_id,user_id,destination,category)
 values(bank_tx,owner,p_destination,nullif(left(btrim(p_category),80),''))
 on conflict(bank_transaction_id) do update set destination=excluded.destination,category=excluded.category,classified_at=now();
 return true;
end $function$

revoke all on function public.prime_whatsapp_classify_bank(text,uuid,text,text,text) from public,authenticated;
grant execute on function public.prime_whatsapp_classify_bank(text,uuid,text,text,text) to anon;
