-- Prime Finance Premium automation schema.
-- Additive only: never rewrite bank history or reconciled accounting entries.

alter table public.counterparties add column if not exists whatsapp_consent boolean not null default false;
alter table public.counterparties add column if not exists whatsapp_authorized_at timestamptz;
create index if not exists counterparties_ws_kind_idx on public.counterparties(workspace_id,kind);

create table if not exists public.prime_recurring_bills (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 counterparty_id uuid references public.counterparties(id) on delete set null,
 description text not null check(length(btrim(description)) between 2 and 180),
 amount numeric(18,2) not null check(amount>0 and amount<=100000000),
 due_day int not null check(due_day between 1 and 31),
 starts_on date not null default current_date,
 ends_on date,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint recurring_bill_dates check(ends_on is null or ends_on >= starts_on)
);
alter table public.prime_recurring_bills enable row level security;
drop policy if exists recurring_bill_owner_all on public.prime_recurring_bills;
create policy recurring_bill_owner_all on public.prime_recurring_bills to authenticated
 using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())))
 with check(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.prime_recurring_bills to authenticated;
create index if not exists prime_recurring_bills_ws_idx on public.prime_recurring_bills(workspace_id,active);

create table if not exists public.prime_bill_occurrences (
 bill_id uuid not null references public.prime_recurring_bills(id) on delete cascade,
 due_date date not null,
 payable_id uuid not null references public.payables(id) on delete restrict,
 created_at timestamptz not null default now(),
 primary key(bill_id,due_date),
 unique(payable_id)
);
alter table public.prime_bill_occurrences enable row level security;
drop policy if exists bill_occurrence_owner_read on public.prime_bill_occurrences;
create policy bill_occurrence_owner_read on public.prime_bill_occurrences for select to authenticated
 using (exists(select 1 from public.prime_recurring_bills b join public.workspaces w on w.id=b.workspace_id
  where b.id=bill_id and w.owner_id=(select auth.uid())));
grant select on public.prime_bill_occurrences to authenticated;

create table if not exists public.prime_trip_workers (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 worker_id uuid not null references public.counterparties(id) on delete restrict,
 role text not null check(role in ('driver','helper')),
 amount numeric(18,2) not null check(amount>=0 and amount<=100000),
 notes text,
 created_at timestamptz not null default now(),
 unique(trip_id,worker_id,role)
);
alter table public.prime_trip_workers enable row level security;
drop policy if exists trip_workers_owner_all on public.prime_trip_workers;
create policy trip_workers_owner_all on public.prime_trip_workers to authenticated
 using (exists(select 1 from public.trips t join public.workspaces w on w.id=t.workspace_id
 where t.id=trip_id and w.owner_id=(select auth.uid())))
 with check(exists(select 1 from public.trips t join public.workspaces w on w.id=t.workspace_id
 where t.id=trip_id and w.owner_id=(select auth.uid())));
grant select,insert,update,delete on public.prime_trip_workers to authenticated;
create index if not exists trip_worker_worker_idx on public.prime_trip_workers(worker_id);

create table if not exists public.prime_notification_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 bank_alerts boolean not null default true,
 weekly_reports boolean not null default true,
 monthly_reports boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.prime_notification_settings enable row level security;
drop policy if exists prime_notif_owner_all on public.prime_notification_settings;
create policy prime_notif_owner_all on public.prime_notification_settings to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update on public.prime_notification_settings to authenticated;

create table if not exists public.prime_outbox (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 dedupe_key text not null unique,
 category text not null check(category in ('bank','report','own-reminder')),
 reference text,
 bank_transaction_id uuid references public.bank_transactions(id) on delete set null,
 message text not null check(length(message) between 1 and 4000),
 status text not null default 'pending' check(status in ('pending','processing','retry','sent','failed')),
 attempts int not null default 0,
 processing_started_at timestamptz,
 sent_at timestamptz,
 last_error text,
 created_at timestamptz not null default now()
);
alter table public.prime_outbox enable row level security;
drop policy if exists outbox_owner_read on public.prime_outbox;
create policy outbox_owner_read on public.prime_outbox for select to authenticated using(user_id=(select auth.uid()));
grant select on public.prime_outbox to authenticated;
create index if not exists outbox_pending_idx on public.prime_outbox(status,created_at);
create unique index if not exists outbox_reference_unique_idx on public.prime_outbox(user_id,reference)
  where reference is not null;

create table if not exists public.prime_bank_classifications (
 bank_transaction_id uuid primary key references public.bank_transactions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 destination text not null check(destination in ('prime','personal','interest','transfer','pending')),
 category text,
 classified_at timestamptz not null default now()
);
alter table public.prime_bank_classifications enable row level security;
drop policy if exists bank_class_owner_all on public.prime_bank_classifications;
create policy bank_class_owner_all on public.prime_bank_classifications to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update,delete on public.prime_bank_classifications to authenticated;

-- Existing owner's verified pairing was explicitly configured for personal use.
insert into public.prime_notification_settings(user_id)
 select user_id from public.whatsapp_pairings where enabled and connected_at is not null
 on conflict(user_id) do nothing;

-- Generate a small rolling horizon: current month + next month.
-- Run through the existing authenticated server cron; idempotent via (bill_id,due_date).
create or replace function public.prime_materialize_bills(p_secret text)
returns integer language plpgsql security definer set search_path=public
as $$
declare today_br date:=(now() at time zone 'America/Sao_Paulo')::date;
 target_month date;
 last_day int;
 due date;
 b record;
 target_payable uuid;
 counter integer:=0;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 for b in select * from public.prime_recurring_bills where active loop
  for target_month in select date_trunc('month',today_br)::date
     union all select (date_trunc('month',today_br)+interval '1 month')::date loop
   last_day=extract(day from (target_month+interval '1 month'-interval '1 day'))::int;
   due=target_month+ (least(last_day,b.due_day)-1);
   if due<b.starts_on or (b.ends_on is not null and due>b.ends_on) then continue; end if;
   if exists(select 1 from public.prime_bill_occurrences where bill_id=b.id and due_date=due) then continue; end if;
   insert into public.payables(workspace_id,counterparty_id,description,amount,due_date,status)
   values(b.workspace_id,b.counterparty_id,b.description,b.amount,due,'open') returning id into target_payable;
   insert into public.prime_bill_occurrences(bill_id,due_date,payable_id) values(b.id,due,target_payable);
   counter=counter+1;
  end loop;
 end loop;
 return counter;
end $$;
revoke all on function public.prime_materialize_bills(text) from public;
grant execute on function public.prime_materialize_bills(text) to anon,authenticated;

create or replace function public.prime_claim_outbox(p_secret text,p_limit int default 12)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare response jsonb;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 with eligible as(
  select o.id from public.prime_outbox o
   join public.whatsapp_pairings p on p.user_id=o.user_id and p.enabled and p.connected_at is not null
   where p.phone_number ~ '^[0-9]{10,15}$' and o.attempts<4 and
     (o.status in('pending','retry') or(o.status='processing' and o.processing_started_at<now()-interval '20 minutes'))
     and (o.category<>'bank' or coalesce((select s.bank_alerts from public.prime_notification_settings s where s.user_id=o.user_id),false))
   order by o.created_at for update of o skip locked
   limit least(greatest(coalesce(p_limit,12),1),30)
 ), claimed as(
  update public.prime_outbox o set status='processing',attempts=o.attempts+1,processing_started_at=now(),last_error=null
  where o.id in(select id from eligible) returning o.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'phone',p.phone_number,'message',c.message)), '[]'::jsonb)
 into response from claimed c join public.whatsapp_pairings p on p.user_id=c.user_id;
 return response;
end $$;
create or replace function public.prime_finish_outbox(p_secret text,p_id uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 update public.prime_outbox
 set status=case when p_success then 'sent' when attempts>=4 then 'failed' else 'retry' end,
 sent_at=case when p_success then now() else null end, processing_started_at=null,
 last_error=case when p_success then null else left(coalesce(p_error,'Falha de envio'),180) end
 where id=p_id and status='processing';
 return found;
end $$;
revoke all on function public.prime_claim_outbox(text,int) from public;
revoke all on function public.prime_finish_outbox(text,uuid,boolean,text) from public;
grant execute on function public.prime_claim_outbox(text,int) to anon,authenticated;
grant execute on function public.prime_finish_outbox(text,uuid,boolean,text) to anon,authenticated;

create or replace function public.prime_bank_import_event(
 p_secret text,p_item_id uuid,p_account_id uuid,p_rows jsonb)
returns integer language plpgsql security definer set search_path=public as $$
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
  if new_row and phone_exists and (recordrow->>'date')::date>=((now() at time zone 'America/Sao_Paulo')::date-5) then
   shortref:=upper(substr(md5(saved_id::text),1,8));
   insert into public.prime_outbox(user_id,dedupe_key,category,reference,bank_transaction_id,message)
   values(conn.owner_id,'bank:'||saved_id,'bank',shortref,saved_id,
    'Prime Finance · Nova movimentação no '||left(conn.display_name,50)||E'\n'||
    case when recordrow->>'direction'='debit' then 'Saída' else 'Entrada' end||
    ' · R$ '||to_char((recordrow->>'amount')::numeric,'FM999G999G990D00')||
    E'\n'||left(coalesce(recordrow->>'description','Movimentação'),160)||
    E'\nCódigo: '||shortref||
    E'\nResponda: classificar '||shortref||' prime combustível\n'||
    'Ou use pessoal, juros, transferência ou pendente. A classificação não paga dívidas.')
   on conflict(dedupe_key) do nothing;
  end if;
 end loop;
 return n;
end $$;
revoke all on function public.prime_bank_import_event(text,uuid,uuid,jsonb) from public;
grant execute on function public.prime_bank_import_event(text,uuid,uuid,jsonb) to anon,authenticated;

create or replace function public.prime_whatsapp_classify_bank(
 p_secret text,p_event_id uuid,p_reference text,p_destination text,p_category text)
returns boolean language plpgsql security definer set search_path=public as $$
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
 select o.bank_transaction_id into bank_tx from public.prime_outbox o
 where o.user_id=owner and o.reference=p_reference and o.category='bank';
 if bank_tx is null then return false;end if;
 insert into public.prime_bank_classifications(bank_transaction_id,user_id,destination,category)
 values(bank_tx,owner,p_destination,nullif(left(btrim(p_category),80),''))
 on conflict(bank_transaction_id) do update set destination=excluded.destination,category=excluded.category,classified_at=now();
 return true;
end $$;
revoke all on function public.prime_whatsapp_classify_bank(text,uuid,text,text,text) from public;
grant execute on function public.prime_whatsapp_classify_bank(text,uuid,text,text,text) to anon,authenticated;

notify pgrst,'reload schema';
