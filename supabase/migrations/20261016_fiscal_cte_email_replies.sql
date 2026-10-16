-- Outgoing CT-e email audit. Only server-side service role can write.
create table if not exists public.fiscal_cte_email_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  draft_id uuid not null unique references public.fiscal_drafts(id) on delete restrict,
  source_message_id text not null,
  source_thread_id text,
  recipient_email text not null,
  cte_access_key text not null check (length(cte_access_key)=44),
  status text not null check (status in ('sending','sent','indeterminate')),
  gmail_sent_message_id text,
  gmail_thread_id text,
  requested_by uuid not null references auth.users(id),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fiscal_cte_email_replies_workspace_idx
 on public.fiscal_cte_email_replies(workspace_id,created_at desc);
alter table public.fiscal_cte_email_replies enable row level security;
revoke all on public.fiscal_cte_email_replies from anon,authenticated;
grant select on public.fiscal_cte_email_replies to authenticated;
create policy "Prime owner reads own CT-e delivery status"
 on public.fiscal_cte_email_replies for select to authenticated
 using (exists(
  select 1 from public.workspaces w where w.id=workspace_id and w.kind='prime' and w.owner_id=auth.uid()
 ));
