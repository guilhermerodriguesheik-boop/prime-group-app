alter table public.bank_connections
 add column if not exists webhook_check_at timestamptz,
 add column if not exists webhook_check_status text not null default 'not_checked'
  check (webhook_check_status in ('not_checked','verified','failed')),
 add column if not exists webhook_check_error text;
comment on column public.bank_connections.webhook_check_status is
 'Most recent live Pluggy webhook item/updated subscription check; does not certify a received event.';
