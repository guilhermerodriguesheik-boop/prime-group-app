alter table public.bank_connections
 add column if not exists provider_last_updated_at timestamptz,
 add column if not exists last_new_transaction_count integer not null default 0 check(last_new_transaction_count>=0),
 add column if not exists last_scanned_transaction_count integer not null default 0 check(last_scanned_transaction_count>=0);
comment on column public.bank_connections.last_synced_at is
 'Hora de importação dos dados disponíveis na Pluggy, não hora de atualização bancária.';
comment on column public.bank_connections.provider_last_updated_at is
 'Último lastUpdatedAt informado pela Pluggy para o item espelho (quando disponível).';
