create table if not exists public.prime_cargo_operations(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 cargo_reference text not null check(cargo_reference ~ '^[1-9][0-9]{3,11}$'),
 service_date date, driver_id uuid references public.drivers(id) on delete set null,
 driver_pay numeric(12,2) not null default 0 check(driver_pay between 0 and 1000000),
 driver_paid boolean not null default false, helper_count integer not null default 0 check(helper_count between 0 and 30),
 helper_rate numeric(12,2) not null default 0 check(helper_rate between 0 and 100000),
 helpers_paid boolean not null default false, diesel numeric(12,2) not null default 0 check(diesel between 0 and 1000000),
 tolls numeric(12,2) not null default 0 check(tolls between 0 and 1000000),
 other_expenses numeric(12,2) not null default 0 check(other_expenses between 0 and 1000000),
 notes text not null default '' check(length(notes)<=300),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,cargo_reference)
);
alter table public.prime_cargo_operations add column if not exists route_description text not null default '' check(length(route_description)<=160);
create index if not exists prime_cargo_operations_workspace_date on public.prime_cargo_operations(workspace_id,service_date desc);
alter table public.prime_cargo_operations enable row level security;
create policy "Prime owner reads cargo operations" on public.prime_cargo_operations for select to authenticated
 using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.kind='prime'));
create policy "Prime owner inserts cargo operations" on public.prime_cargo_operations for insert to authenticated
 with check(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.kind='prime')
 and (driver_id is null or exists(select 1 from public.drivers d where d.id=driver_id and d.workspace_id=workspace_id)));
create policy "Prime owner edits cargo operations" on public.prime_cargo_operations for update to authenticated
 using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.kind='prime'))
 with check(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.kind='prime')
 and (driver_id is null or exists(select 1 from public.drivers d where d.id=driver_id and d.workspace_id=workspace_id)));
grant select,insert,update on public.prime_cargo_operations to authenticated;