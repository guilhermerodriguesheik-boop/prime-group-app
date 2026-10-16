alter table public.fiscal_transport_profiles add column if not exists cte_defaults jsonb not null default '{}'::jsonb;
