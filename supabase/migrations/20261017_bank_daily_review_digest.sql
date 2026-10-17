-- Unique delivery receipts; pre-existing transactions are not treated as new today.
create table if not exists public.prime_bank_digest_items(
 bank_transaction_id uuid primary key references public.bank_transactions(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 outbox_id uuid references public.prime_outbox(id) on delete set null,
 source text not null check(source in ('baseline','digest')),
 created_at timestamptz not null default now()
);
create index if not exists prime_bank_digest_items_owner on public.prime_bank_digest_items(owner_id,created_at desc);
alter table public.prime_bank_digest_items enable row level security;
create policy "Owner can read bank review deliveries" on public.prime_bank_digest_items
 for select to authenticated using(owner_id=(select auth.uid()));
grant select on public.prime_bank_digest_items to authenticated;
insert into public.prime_bank_digest_items(bank_transaction_id,owner_id,source)
 select id,owner_id,'baseline' from public.bank_transactions
 on conflict(bank_transaction_id) do nothing;

CREATE OR REPLACE FUNCTION public.prime_queue_bank_review_digest(p_secret text, p_limit integer DEFAULT 22)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 usr record; move record; new_id uuid; message text; item_line text;
 item_ids uuid[]; item_count int; outgoing numeric; incoming numeric;
 suggest_kind text; suggest_name text; suggestion_count int;
 created_count int:=0; batch_size int:=least(greatest(coalesce(p_limit,22),1),22);
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 for usr in
  select pair.user_id from public.whatsapp_pairings pair
  join public.prime_notification_settings s on s.user_id=pair.user_id
  where pair.enabled and pair.connected_at is not null and s.bank_alerts
    and pair.phone_number ~ '^[0-9]{10,15}$'
 loop
  item_ids:=array[]::uuid[];item_count:=0;incoming:=0;outgoing:=0;
  message:='PRIME FINANCE | NOVAS MOVIMENTACOES'||E'\n'||
   'Conferencia bancaria: movimentacoes importadas, sem baixa automatica.'||E'\n\n';
  for move in
   select t.id,t.workspace_id,t.owner_id,t.occurred_on,t.direction,t.amount,t.description,
          a.display_name as account_name,w.kind as workspace_kind
   from public.bank_transactions t
   join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=t.owner_id
   join public.workspaces w on w.id=t.workspace_id and w.owner_id=t.owner_id
   left join public.prime_bank_digest_items seen on seen.bank_transaction_id=t.id
   where t.owner_id=usr.user_id and t.provider_status='POSTED'
     and t.amount>0 and t.review_status='pending'
     and a.kind='BANK' and a.currency='BRL'
     and seen.bank_transaction_id is null
   order by t.created_at,t.id
   for update of t skip locked limit batch_size
  loop
   item_count:=item_count+1;
   item_ids:=array_append(item_ids,move.id);
   if move.direction='credit' then incoming:=incoming+move.amount;
   else outgoing:=outgoing+move.amount; end if;
   -- Candidate hints are deliberately read-only. Same workspace, sign and amount
   -- plus a near due date are mandatory; ambiguous matches remain unassigned.
   suggest_kind:=case when move.direction='credit' then 'receivable' else 'payable' end;
   if move.direction='credit' then
    select count(*),min(left(r.description,48)) into suggestion_count,suggest_name
    from public.receivables r
    where r.workspace_id=move.workspace_id and r.status in ('open','partial','overdue')
     and abs((r.amount-r.received_amount)-move.amount)<=0.01
     and abs(r.due_date-move.occurred_on)<=7;
   else
    select count(*),min(left(p.description,48)) into suggestion_count,suggest_name
    from public.payables p
    where p.workspace_id=move.workspace_id and p.status in ('open','partial','overdue')
     and abs((p.amount-p.paid_amount)-move.amount)<=0.01
     and abs(p.due_date-move.occurred_on)<=7;
   end if;
   item_line:=to_char(move.occurred_on,'DD/MM')||' | '||
    case when move.direction='credit' then 'ENTRADA' else 'SAIDA' end||' R$ '||
    to_char(move.amount,'FM999999990D00')||' | '||
    left(regexp_replace(move.account_name,E'[\n\r]+',' ','g'),35)||' ('||
    case when move.workspace_kind='prime' then 'Empresa'
         when move.workspace_kind='personal' then 'Pessoal' else 'Outro' end||')'||
    E'\n'||left(regexp_replace(move.description,E'[\n\r]+',' ','g'),75);
   if suggestion_count=1 then
    item_line:=item_line||E'\n'||
      'Possivel '||case when move.direction='credit' then 'recebimento' else 'pagamento' end||
      ': '||suggest_name||' [CONFIRMAR]';
   elsif suggestion_count>1 then
    item_line:=item_line||E'\nMultiplas contas possiveis [REVISAR]';
   end if;
   message:=message||item_count||'. '||item_line||E'\n\n';
  end loop;
  if item_count>0 then
   message:=message||'TOTAL: '||item_count||' movimento(s)'||E'\n'||
    'Entradas: R$ '||to_char(incoming,'FM999999990D00')||E'\n'||
    'Saidas: R$ '||to_char(outgoing,'FM999999990D00')||E'\n\n'||
    'Classifique e confira: https://prime-finance-ochre.vercel.app/financeiro'||E'\n'||
    'Sugestoes nao representam conciliacao ou pagamento confirmado.';
   insert into public.prime_outbox(user_id,dedupe_key,category,reference,message)
   values(usr.user_id,'bank-digest:'||item_ids[1]::text,'bank',
    to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYYMMDD'),left(message,3900))
   on conflict(dedupe_key) do nothing returning id into new_id;
   if new_id is not null then
    insert into public.prime_bank_digest_items(bank_transaction_id,owner_id,outbox_id,source)
     select unnest(item_ids),usr.user_id,new_id,'digest'
     on conflict(bank_transaction_id) do nothing;
    created_count:=created_count+1;
   end if;
   new_id:=null;
  end if;
 end loop;
 return created_count;
end $function$

revoke all on function public.prime_queue_bank_review_digest(text,integer) from public,anon,authenticated;
grant execute on function public.prime_queue_bank_review_digest(text,integer) to service_role;
-- Replaces old per-transaction WhatsApp sends with grouped notifications.
CREATE OR REPLACE FUNCTION public.prime_bank_import_event(p_secret text, p_item_id uuid, p_account_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare conn record; account record; recordrow jsonb; saved_id uuid; n integer:=0; new_row boolean; phone_exists boolean;
 shortref text;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>80 then raise exception 'invalid batch';end if;
 select c.id,c.owner_id,c.workspace_id,c.display_name into conn from public.bank_connections c
 where c.provider='pluggy' and c.provider_item_id=p_item_id::text and c.archived_at is null and c.status<>'disconnected';
 if not found then return 0;end if;
 select a.id into account from public.bank_accounts a
 where a.connection_id=conn.id and a.provider_account_id=p_account_id::text and a.owner_id=conn.owner_id;
 if not found then return 0;end if;
 phone_exists:=exists(select 1 from public.whatsapp_pairings wp join public.prime_notification_settings s on s.user_id=wp.user_id
 where wp.user_id=conn.owner_id and wp.enabled and wp.connected_at is not null and s.bank_alerts);
 for recordrow in select * from jsonb_array_elements(p_rows) loop
  if length(coalesce(recordrow->>'id',''))<6 or length(coalesce(recordrow->>'id',''))>150
   or coalesce((recordrow->>'amount')::numeric,0)<0 or coalesce((recordrow->>'amount')::numeric,0)>100000000
   or coalesce(recordrow->>'direction','') not in ('credit','debit')
   or (recordrow->>'date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then continue;end if;
  new_row:=not exists(select 1 from public.bank_transactions t
   where t.bank_account_id=account.id and t.provider_transaction_id=recordrow->>'id');
  insert into public.bank_transactions(owner_id,workspace_id,bank_account_id,provider_transaction_id,
    occurred_on,description,amount,direction,provider_status,updated_at)
  values(conn.owner_id,conn.workspace_id,account.id,recordrow->>'id',(recordrow->>'date')::date,
    left(coalesce(recordrow->>'description','Movimentação'),350),
    (recordrow->>'amount')::numeric,recordrow->>'direction',
    case when recordrow->>'status'='PENDING' then 'PENDING' else 'POSTED' end,now())
  on conflict(bank_account_id,provider_transaction_id) do update set
    description=excluded.description,amount=excluded.amount,direction=excluded.direction,provider_status=excluded.provider_status,updated_at=now()
  returning id into saved_id;
  if new_row then n=n+1;end if;
  -- New movements are now queued as consolidated bank digests by the worker.
 end loop;
 return n;
end $function$
