-- Preserve authenticated owner validation; do not allow investment transfers to settle bills.
-- Process new inbound WhatsApp messages before reattempting older failed work.
CREATE OR REPLACE FUNCTION public.prime_bank_bill_match_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 who uuid:=auth.uid();
 rec record; obligation record; due_amount numeric; effective numeric;
begin
 if who is null then raise exception 'Sessão não autenticada'; end if;
 if TG_OP='INSERT' then
  if NEW.owner_id<>who then raise exception 'Proprietário inválido'; end if;
  if NEW.bill_kind not in ('payable','receivable') then raise exception 'Tipo inválido'; end if;
  select b.id,b.owner_id,b.workspace_id,b.amount,b.direction,b.description,b.provider_status,
   b.review_status,b.linked_transaction_id into rec
   from public.bank_transactions b join public.bank_accounts a on a.id=b.bank_account_id
   where b.id=NEW.bank_transaction_id and b.owner_id=who
     and a.owner_id=who and a.workspace_id=b.workspace_id
     and a.kind='BANK' and a.currency='BRL'
   for update of b;
  if not found then raise exception 'Extrato não autorizado'; end if;
  if (rec.direction='debit' and rec.description ~* '(APL[[:space:]]+APLIC|APLIC[[:space:]]+AUT|APLICACAO|APLICAÇÃO)')
    or (rec.direction='credit' and rec.description ~* '(RES[[:space:]]+APLIC|RESGATE[[:space:]]+APLIC)') then
    raise exception 'Aplicações e resgates são transferências financeiras, não baixas de contas a pagar/receber';
  end if;
  if rec.workspace_id<>NEW.workspace_id or rec.amount<>NEW.amount or rec.amount<=0
    or rec.provider_status<>'POSTED' or rec.review_status<>'pending'
    or rec.linked_transaction_id is not null then
    raise exception 'Movimentação não disponível para baixa'; end if;
  if (NEW.bill_kind='payable' and rec.direction<>'debit')
    or (NEW.bill_kind='receivable' and rec.direction<>'credit') then
    raise exception 'Movimento não corresponde à conta'; end if;
  if not exists(select 1 from public.workspaces w where w.id=NEW.workspace_id
       and w.owner_id=who and w.kind in ('prime','personal')) then
    raise exception 'Ambiente financeiro não autorizado'; end if;
  if NEW.bill_kind='payable' then
    select p.amount,p.paid_amount as settled,p.status,p.due_date into obligation
    from public.payables p where p.id=NEW.bill_id and p.workspace_id=NEW.workspace_id
      and p.status not in ('cancelled','paid') for update;
  else
    select p.amount,p.received_amount as settled,p.status,p.due_date into obligation
    from public.receivables p where p.id=NEW.bill_id and p.workspace_id=NEW.workspace_id
      and p.status not in ('cancelled','received') for update;
  end if;
  if not found then raise exception 'Conta não encontrada no mesmo ambiente'; end if;
  due_amount:=round(obligation.amount-obligation.settled,2);
  if rec.amount>due_amount or due_amount<=0 then
    raise exception 'O valor do extrato excede o saldo devido'; end if;
  if NEW.bill_kind='payable' then
   update public.payables set paid_amount=round(obligation.settled+rec.amount,2),
    status=case when rec.amount=due_amount then 'paid' else 'partial' end,updated_at=now()
   where id=NEW.bill_id and workspace_id=NEW.workspace_id;
  else
   update public.receivables set received_amount=round(obligation.settled+rec.amount,2),
    status=case when rec.amount=due_amount then 'received' else 'partial' end,updated_at=now()
   where id=NEW.bill_id and workspace_id=NEW.workspace_id;
  end if;
  update public.bank_transactions set review_status='matched',updated_at=now()
   where id=NEW.bank_transaction_id and owner_id=who;
  NEW.created_at:=now();
  return NEW;
 end if;
 if TG_OP='DELETE' then
  if OLD.owner_id<>who then raise exception 'Proprietário inválido'; end if;
  select b.id,b.owner_id,b.workspace_id,b.review_status into rec
  from public.bank_transactions b where b.id=OLD.bank_transaction_id and b.owner_id=who
  for update;
  if not found or rec.workspace_id<>OLD.workspace_id or rec.review_status<>'matched'
   then raise exception 'Movimentação não disponível para estorno'; end if;
  if OLD.bill_kind='payable' then
   select p.amount,p.paid_amount as settled,p.status,p.due_date into obligation
   from public.payables p where p.id=OLD.bill_id and p.workspace_id=OLD.workspace_id
   for update;
  else
   select p.amount,p.received_amount as settled,p.status,p.due_date into obligation
   from public.receivables p where p.id=OLD.bill_id and p.workspace_id=OLD.workspace_id
   for update;
  end if;
  if not found or obligation.settled<OLD.amount or obligation.status='cancelled'
   then raise exception 'Revisar quitação manual antes de desfazer a conciliação'; end if;
  effective:=round(obligation.settled-OLD.amount,2);
  if OLD.bill_kind='payable' then
   update public.payables set paid_amount=effective,
    status=case when effective>=obligation.amount then 'paid'
     when effective>0 then 'partial' when obligation.due_date<current_date then 'overdue'
     else 'open' end,updated_at=now()
   where id=OLD.bill_id and workspace_id=OLD.workspace_id;
  else
   update public.receivables set received_amount=effective,
    status=case when effective>=obligation.amount then 'received'
     when effective>0 then 'partial' when obligation.due_date<current_date then 'overdue'
     else 'open' end,updated_at=now()
   where id=OLD.bill_id and workspace_id=OLD.workspace_id;
  end if;
  update public.bank_transactions set review_status='pending',updated_at=now()
   where id=OLD.bank_transaction_id and owner_id=who;
  return OLD;
 end if;
 return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.whatsapp_claim_events(p_secret text, p_limit integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare out_rows jsonb;
begin
  if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
  with claims as (
    select id from public.whatsapp_events
    where (status in ('received','retry')
       or (status='processing' and processing_started_at < now()-interval '5 minutes'))
      and attempts < 4
    order by case when status='received' then 0 else 1 end, created_at desc
    for update skip locked
    limit least(greatest(coalesce(p_limit,3),1),5)
  ), updated as (
    update public.whatsapp_events e
    set status='processing',attempts=e.attempts+1,
        processing_started_at=now(),error_message=null
    where e.id in (select id from claims)
    returning e.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'providerId', provider_message_id,
    'from', from_number, 'to', to_number,
    'type', message_type, 'body', body, 'mediaId', media_id,
    'payload', payload, 'attempts', attempts
  )), '[]'::jsonb) into out_rows from updated;
  return out_rows;
end;
$function$
;