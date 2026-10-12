-- Lembretes de vencimento, separados das contas financeiras.
-- Os avisos são exibidos no próprio Prime Finance quando o usuário acessa o sistema.
create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null check (length(btrim(description)) >= 2),
  amount numeric(14,2) check (amount is null or amount >= 0),
  due_date date not null,
  remind_on date not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  payable_id uuid references public.payables(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_reminders_user_pending_idx
  on public.payment_reminders(user_id, remind_on, due_date) where status = 'pending';
create unique index if not exists payment_reminders_payable_user_idx
  on public.payment_reminders(payable_id, user_id) where payable_id is not null;
alter table public.payment_reminders enable row level security;
create policy payment_reminders_owner_select on public.payment_reminders
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy payment_reminders_owner_insert on public.payment_reminders
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_edit_workspace(workspace_id));
create policy payment_reminders_owner_update on public.payment_reminders
  for update to authenticated
  using (user_id = (select auth.uid()) and public.can_edit_workspace(workspace_id))
  with check (user_id = (select auth.uid()) and public.can_edit_workspace(workspace_id));

grant select, insert, update on public.payment_reminders to authenticated;
