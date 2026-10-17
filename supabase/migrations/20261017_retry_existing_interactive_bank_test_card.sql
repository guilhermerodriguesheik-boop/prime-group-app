CREATE OR REPLACE FUNCTION public.prime_queue_bank_button_test(p_secret text, p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare move record; recipient uuid; added uuid; current record; key text;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 select p.user_id into recipient from public.whatsapp_pairings p
 join public.prime_notification_settings settings on settings.user_id=p.user_id
 where p.user_id=p_owner_id and p.enabled and p.connected_at is not null
 and p.phone_number~'^[0-9]{10,15}$' and settings.bank_alerts;
 if recipient is null then
  return jsonb_build_object('ok',false,'reason','WhatsApp ou alertas bancários não ativados');
 end if;
 -- If the previous button test was rejected by the provider, retry that
 -- exact same message after the compatibility fix. Do not create another one.
 select o.id,o.status into current from public.prime_outbox o
 where o.user_id=recipient and o.category='bank'
   and o.dedupe_key like 'bank-card-test:%'
   and o.status in ('retry','pending') and o.attempts<4
 order by o.created_at desc limit 1;
 if found then return jsonb_build_object('ok',true,'id',current.id,
  'status',current.status,'alreadyQueued',true);end if;
 select t.id,t.owner_id,t.amount,t.direction,t.occurred_on,
 a.display_name as bank_name,w.kind as workspace_kind into move
 from public.bank_transactions t
 join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=t.owner_id
 join public.bank_connections c on c.id=a.connection_id and c.owner_id=t.owner_id
 join public.workspaces w on w.id=t.workspace_id and w.id=a.workspace_id and w.owner_id=t.owner_id
 where t.owner_id=recipient and t.amount>0 and t.provider_status in ('POSTED','PENDING')
  and a.kind='BANK' and a.currency='BRL' and c.archived_at is null
 order by t.occurred_on desc,t.created_at desc limit 1;
 if not found then return jsonb_build_object('ok',false,'reason','Nenhum movimento bancário importado');end if;
 key:='bank-card-test:'||move.id::text||':'||
  floor(extract(epoch from now())/900)::bigint::text;
 select id,status into current from public.prime_outbox
 where user_id=recipient and dedupe_key=key;
 if found then return jsonb_build_object('ok',true,'id',current.id,'status',current.status,'alreadyQueued',true);end if;
 insert into public.prime_outbox(user_id,dedupe_key,category,reference,bank_transaction_id,message)
 values(recipient,key,'bank',to_char(move.occurred_on,'YYYYMMDD'),move.id,
  'TESTE DE BOTÕES · '||
   case when move.direction='credit' then 'ENTRADA' else 'SAÍDA' end||
   ' · R$ '||public.prime_format_brl(move.amount)||E'\n'||
   left(move.bank_name,26)||' · '||to_char(move.occurred_on,'DD/MM')||
   case when move.workspace_kind='personal' then ' · Pessoal' else ' · Prime' end
 ) returning id into added;
 return jsonb_build_object('ok',true,'id',added,'status','pending','alreadyQueued',false);
end $function$
;