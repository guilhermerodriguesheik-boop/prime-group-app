-- Record the information supplied, leaving unknown trip details null.
-- Freight amount is a quoted/contracted price, not automatically cash received.
alter table public.trips
  add column if not exists service_date date,
  add column if not exists customer_name text,
  add column if not exists driver_name text,
  add column if not exists driver_cost numeric(14,2),
  add column if not exists notes text;
alter table public.trips
  alter column freight_revenue drop not null,
  alter column freight_revenue drop default;
alter table public.trips
  add constraint trips_driver_cost_nonnegative check (driver_cost is null or driver_cost >= 0);
create index if not exists trips_service_date_idx on public.trips(workspace_id,service_date desc);

-- For user statements that cannot yet be represented as a completed financial
-- operation: preserve the original information without fabricating payments.
create table if not exists public.partial_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  subject text not null default 'Registro parcial',
  original_text text not null check (length(btrim(original_text)) > 0),
  extracted_data jsonb not null default '{}'::jsonb,
  record_kind text not null default 'other',
  status text not null default 'open' check(status in ('open','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.partial_records enable row level security;
create policy partial_records_owner_select on public.partial_records
  for select to authenticated using (
    user_id=(select auth.uid()) and
    (workspace_id is null or public.is_workspace_member(workspace_id))
  );
create policy partial_records_owner_insert on public.partial_records
  for insert to authenticated with check(
    user_id=(select auth.uid()) and
    (workspace_id is null or public.can_edit_workspace(workspace_id))
  );
create policy partial_records_owner_update on public.partial_records
  for update to authenticated
  using (user_id=(select auth.uid()) and
    (workspace_id is null or public.can_edit_workspace(workspace_id)))
  with check (user_id=(select auth.uid()) and
    (workspace_id is null or public.can_edit_workspace(workspace_id)));
create index if not exists partial_records_user_open_idx
  on public.partial_records(user_id,created_at desc) where status='open';
grant select,insert,update on public.partial_records to authenticated;
