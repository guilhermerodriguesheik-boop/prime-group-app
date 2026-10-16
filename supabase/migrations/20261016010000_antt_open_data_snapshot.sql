alter table public.fiscal_transport_profiles add column if not exists rntrc_snapshot_status text;
alter table public.fiscal_transport_profiles add column if not exists rntrc_snapshot_checked_at timestamptz;
alter table public.fiscal_transport_profiles add column if not exists rntrc_snapshot_period text;
alter table public.fiscal_transport_profiles add column if not exists rntrc_snapshot_company text;
