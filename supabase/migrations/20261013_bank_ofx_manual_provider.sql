-- Add safe bank statement import when there is no commercial aggregation plan.
-- Manual import is read-only staging and never writes financial ledger.
alter table public.bank_connections drop constraint if exists bank_connections_provider_check;
alter table public.bank_connections
  add constraint bank_connections_provider_check
  check (provider in ('pluggy','manual'));
notify pgrst, 'reload schema';
