CREATE OR REPLACE FUNCTION public.prime_claim_outbox(p_secret text, p_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare response jsonb;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 with eligible as(
  select o.id from public.prime_outbox o
   join public.whatsapp_pairings p on p.user_id=o.user_id and p.enabled and p.connected_at is not null
   left join public.counterparties c on c.id=o.contact_id
   left join public.workspaces w on w.id=c.workspace_id
   where o.attempts<4 and
     (o.status in('pending','retry') or(o.status='processing' and o.processing_started_at<now()-interval '20 minutes'))
     and (o.category<>'bank' or coalesce((select s.bank_alerts from public.prime_notification_settings s where s.user_id=o.user_id),false))
     and (
       (o.category='collection' and c.whatsapp_consent and c.whatsapp_authorized_at is not null
         and w.owner_id=o.user_id and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')~'^[0-9]{10,15}$')
       or (o.category<>'collection' and p.phone_number ~ '^[0-9]{10,15}$')
     )
   order by o.created_at for update of o skip locked
   limit least(greatest(coalesce(p_limit,12),1),30)
 ), claimed as(
  update public.prime_outbox o set status='processing',attempts=o.attempts+1,processing_started_at=now(),last_error=null
  where o.id in(select id from eligible) returning o.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'phone',
   case when c.category='collection' then case when length(regexp_replace(cp.phone,'[^0-9]','','g')) in (10,11)
      then '55'||regexp_replace(cp.phone,'[^0-9]','','g')
      else regexp_replace(cp.phone,'[^0-9]','','g') end
     else p.phone_number end,
   'message',c.message,'bankTransactionId',c.bank_transaction_id)), '[]'::jsonb)
 into response from claimed c join public.whatsapp_pairings p on p.user_id=c.user_id
 left join public.counterparties cp on cp.id=c.contact_id;
 return response;
end $function$
;

create or replace function public.prime_queue_bank_review_digest(
 p_secret text,p_limit integer default 48
) returns integer language plpgsql security definer set search_path=public,pg_temp
as $bank_cards$
declare usr record; move record; queued uuid; total int:=0;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 for usr in
 select pair.user_id from public.whatsapp_pairings pair
 join public.prime_notification_settings settings on settings.user_id=pair.user_id
 where pair.enabled and pair.connected_at is not null and settings.bank_alerts
  and pair.phone_number~'^[0-9]{10,15}$'
 loop
  for move in
   select t.id,t.owner_id,t.occurred_on,t.amount,t.direction,t.description,t.provider_status,
   a.display_name as bank_name,w.kind as workspace_kind
   from public.bank_transactions t
   join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=t.owner_id
   join public.bank_connections c on c.id=a.connection_id and c.owner_id=t.owner_id
      and c.archived_at is null and c.status in ('connected','attention')
   join public.workspaces w on w.id=t.workspace_id and w.id=a.workspace_id and w.owner_id=t.owner_id
   left join public.prime_bank_digest_items seen on seen.bank_transaction_id=t.id
   where t.owner_id=usr.user_id and t.provider_status in ('POSTED','PENDING')
    and t.amount>0
    and a.kind='BANK' and a.currency='BRL'
    and seen.bank_transaction_id is null
   order by t.created_at,t.id
   for update of t skip locked
   limit least(greatest(coalesce(p_limit,48),1),48)
  loop
   queued:=null;
   insert into public.prime_outbox(user_id,dedupe_key,category,reference,bank_transaction_id,message)
   values(
    usr.user_id,'bank-card:'||move.id::text,'bank',
    to_char(move.occurred_on,'YYYYMMDD'),move.id,
    case when move.direction='credit' then 'ENTRADA' else 'SAÍDA' end||
     ' · R$ '||public.prime_format_brl(move.amount)||E'\n'||
     left(regexp_replace(coalesce(move.bank_name,'Banco'),E'[\r\n]+',' ','g'),22)||' · '||
     to_char(move.occurred_on,'DD/MM')||
     case when move.workspace_kind='personal' then ' · Pessoal' else ' · Prime' end||
     case when move.provider_status='PENDING' then E'\nAguardando confirmação do banco' else '' end
   )
   on conflict(dedupe_key) do nothing returning id into queued;
   if queued is not null then
    insert into public.prime_bank_digest_items(bank_transaction_id,owner_id,outbox_id,source)
     values(move.id,usr.user_id,queued,'digest')
     on conflict(bank_transaction_id) do nothing;
    total:=total+1;
   end if;
  end loop;
 end loop;
 return total;
end $bank_cards$;
revoke all on function public.prime_queue_bank_review_digest(text,integer)
 from public,authenticated;
grant execute on function public.prime_queue_bank_review_digest(text,integer) to anon;


create or replace function public.prime_bank_card_button_action(
 p_secret text,p_event_id uuid,p_button_id text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $bank_button$
declare ow uuid; oid uuid; choice text; rec record; label text;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_button_id is null or p_button_id !~
  '^pb1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[EPMITU]$'
 then return jsonb_build_object('ok',false,'reason','invalid_button');end if;
 oid:=split_part(p_button_id,'.',2)::uuid;
 choice:=split_part(p_button_id,'.',3);
 select pair.user_id into ow
 from public.whatsapp_events ev
 join public.whatsapp_pairings pair
  on pair.phone_number=regexp_replace(coalesce(ev.from_number,''),'[^0-9]','','g')
  and pair.enabled and pair.connected_at is not null
 where ev.id=p_event_id and ev.status='processing'
  and ev.message_type='interactive'
  and ev.body=p_button_id
  and ev.payload->'__evolutionGoButton'->>'buttonId'=p_button_id;
 if ow is null then return jsonb_build_object('ok',false,'reason','unauthorized');end if;
 select o.id,o.status,o.sent_at,o.bank_transaction_id,t.owner_id,t.amount,t.direction,
 t.description,t.provider_status into rec
 from public.prime_outbox o
 join public.bank_transactions t on t.id=o.bank_transaction_id and t.owner_id=o.user_id
 join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=t.owner_id
 join public.workspaces w on w.id=t.workspace_id and w.id=a.workspace_id and w.owner_id=t.owner_id
 where o.id=oid and o.user_id=ow and o.category='bank' and a.kind='BANK'
  and a.currency='BRL' and o.sent_at>=now()-interval '30 days'
  and o.status='sent' for update of t;
 if not found then return jsonb_build_object('ok',false,'reason','expired');end if;
 if choice='M' then return jsonb_build_object('ok',true,'type','more',
    'outboxId',oid,'amount',rec.amount);end if;
 label:=case choice when 'E' then 'prime' when 'P' then 'personal'
 when 'I' then 'interest' when 'T' then 'transfer' when 'U' then 'pending'
 else null end;
 if label is null then return jsonb_build_object('ok',false,'reason','invalid_choice');end if;
 insert into public.prime_bank_classifications(bank_transaction_id,user_id,destination,category)
 values(rec.bank_transaction_id,ow,label,null)
 on conflict(bank_transaction_id) do update set
 destination=excluded.destination,
 category=case when prime_bank_classifications.destination=excluded.destination
 then prime_bank_classifications.category else null end,
 classified_at=now();
 return jsonb_build_object('ok',true,'type','classified','destination',label,
    'amount',rec.amount,'transactionId',rec.bank_transaction_id);
end $bank_button$;
revoke all on function public.prime_bank_card_button_action(text,uuid,text)
 from public,authenticated;
grant execute on function public.prime_bank_card_button_action(text,uuid,text) to anon;


-- Old grouped notifications that have not been dispatched are superseded by cards.
update public.prime_outbox
 set status='failed',attempts=4,
 last_error='Substituído por notificações individuais com botões'
 where category='bank' and dedupe_key like 'bank-digest:%'
 and status in ('pending','retry') and sent_at is null;
-- Do not retroactively send all historical transactions. Existing digest receipts
-- remain recorded; new imports enter the one-card-per-transaction queue.
