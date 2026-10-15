create table if not exists public.ortobom_financial_emails(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 message_id text not null,
 event_kind text not null check(event_kind in ('advance','period_payment')),
 subject text not null, sender text not null,
 email_date timestamptz,
 payment_date date, period_start date,period_end date,
 declared_bank_deposit numeric(15,2),declared_promissory_discount numeric(15,2),
 imported_at timestamptz not null default now(),
 unique(workspace_id,message_id)
);
create table if not exists public.ortobom_financial_lines(
 id uuid primary key default gen_random_uuid(),
 email_id uuid not null references public.ortobom_financial_emails(id) on delete cascade,
 line_number integer not null,
 cargo_reference text not null,
 cte_number text,
 declared_freight numeric(15,2),declared_advance numeric(15,2),
 declared_balance numeric(15,2),
 unique(email_id,line_number)
);
create index if not exists ortobom_financial_emails_workspace_kind_idx on public.ortobom_financial_emails(workspace_id,event_kind,email_date desc);
create index if not exists ortobom_financial_lines_cargo_idx on public.ortobom_financial_lines(cargo_reference);
alter table public.ortobom_financial_emails enable row level security;
alter table public.ortobom_financial_lines enable row level security;
revoke all on public.ortobom_financial_emails from anon,authenticated;
revoke all on public.ortobom_financial_lines from anon,authenticated;
grant select on public.ortobom_financial_emails to authenticated;
grant select on public.ortobom_financial_lines to authenticated;
create policy "Owner reads own Ortobom reports" on public.ortobom_financial_emails for select to authenticated
 using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=auth.uid() and w.kind='prime'));
create policy "Owner reads lines from own Ortobom reports" on public.ortobom_financial_lines for select to authenticated
 using(exists(select 1 from public.ortobom_financial_emails e join public.workspaces w on w.id=e.workspace_id
 where e.id=email_id and w.owner_id=auth.uid() and w.kind='prime'));
