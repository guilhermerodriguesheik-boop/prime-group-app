-- Bank data is imported for review; NEVER post financial ledger entries automatically.
-- Bank sync uses authenticated user RLS, not a public service key.
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'pluggy' check (provider='pluggy'),
  provider_item_id text not null,
  display_name text not null,
  institution_name text,
  account_kind text not null check (account_kind in ('business','personal')),
  status text not null default 'connected' check (status in ('connected','attention','disconnected')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider,provider_item_id)
);
create index if not exists bank_connections_owner_idx on public.bank_connections(owner_id,workspace_id);
alter table public.bank_connections enable row level security;
create policy bank_connections_owner_select on public.bank_connections for select to authenticated
  using (owner_id=(select auth.uid()) and exists (
    select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())
  ));
create policy bank_connections_owner_insert on public.bank_connections for insert to authenticated
  with check (owner_id=(select auth.uid()) and exists (
    select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())
  ));
create policy bank_connections_owner_update on public.bank_connections for update to authenticated
  using (owner_id=(select auth.uid()) and exists (
    select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())
  ))
  with check (owner_id=(select auth.uid()) and exists (
    select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())
  ));
grant select,insert,update on public.bank_connections to authenticated;

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  provider_account_id text not null,
  display_name text not null,
  account_last4 text,
  kind text not null default 'BANK' check (kind in ('BANK','CREDIT')),
  currency text not null default 'BRL',
  balance numeric(18,2),
  balance_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id,provider_account_id)
);
create index if not exists bank_accounts_owner_idx on public.bank_accounts(owner_id,connection_id);
alter table public.bank_accounts enable row level security;
create policy bank_accounts_owner_all on public.bank_accounts for all to authenticated
  using (owner_id=(select auth.uid()) and exists(
    select 1 from public.bank_connections c where c.id=connection_id and c.owner_id=(select auth.uid()) and c.workspace_id=workspace_id
  ))
  with check (owner_id=(select auth.uid()) and exists(
    select 1 from public.bank_connections c where c.id=connection_id and c.owner_id=(select auth.uid()) and c.workspace_id=workspace_id
  ));
grant select,insert,update on public.bank_accounts to authenticated;

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  provider_transaction_id text not null,
  occurred_on date not null,
  description text not null,
  amount numeric(18,2) not null,
  direction text not null check (direction in ('credit','debit')),
  provider_status text not null check (provider_status in ('PENDING','POSTED')),
  category text,
  review_status text not null default 'pending' check (review_status in ('pending','matched','ignored')),
  linked_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_account_id,provider_transaction_id)
);
create index if not exists bank_transactions_owner_date_idx on public.bank_transactions(owner_id,occurred_on desc);
create index if not exists bank_transactions_review_idx on public.bank_transactions(owner_id,review_status);
alter table public.bank_transactions enable row level security;
create policy bank_transactions_owner_all on public.bank_transactions for all to authenticated
  using (owner_id=(select auth.uid()) and exists (
    select 1 from public.bank_accounts a where a.id=bank_account_id and a.owner_id=(select auth.uid()) and a.workspace_id=workspace_id
  ))
  with check (owner_id=(select auth.uid()) and exists (
    select 1 from public.bank_accounts a where a.id=bank_account_id and a.owner_id=(select auth.uid()) and a.workspace_id=workspace_id
  ));
grant select,insert,update on public.bank_transactions to authenticated;
-- Ledger and balance snapshots stay separate until explicit reconciliation.
notify pgrst, 'reload schema';
