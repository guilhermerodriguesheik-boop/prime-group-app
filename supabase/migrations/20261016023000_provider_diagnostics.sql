create table if not exists public.fiscal_provider_diagnostics (
 provider text not null,
 environment text not null,
 checked_at timestamptz not null default now(),
 usage_http_status integer,
 emitters_http_status integer,
 authenticated boolean not null default false,
 check_error text,
 primary key(provider,environment)
);
alter table public.fiscal_provider_diagnostics enable row level security;
revoke all on public.fiscal_provider_diagnostics from anon,authenticated;
