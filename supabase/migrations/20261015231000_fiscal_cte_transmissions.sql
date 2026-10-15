-- At most one issuance attempt per draft. Application access is service-role only.
create table if not exists public.fiscal_cte_transmissions (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 draft_id uuid not null unique references public.fiscal_drafts(id) on delete restrict,
 requested_by uuid not null references auth.users(id),
 idempotency_key uuid not null unique,
 payload_sha256 text not null check (length(payload_sha256)=64),
 status text not null check (status in ('sending','authorized','rejected','indeterminate')),
 access_key text,
 protocol text,
 error_code text,
 provider_response jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists fiscal_cte_transmissions_workspace_idx on public.fiscal_cte_transmissions(workspace_id,created_at desc);
alter table public.fiscal_cte_transmissions enable row level security;
revoke all on public.fiscal_cte_transmissions from anon,authenticated;
grant select on public.fiscal_cte_transmissions to authenticated;
create policy "Owner can read only own CT-e transmission status"
 on public.fiscal_cte_transmissions for select to authenticated
 using (exists (
  select 1 from public.workspaces w
  where w.id=fiscal_cte_transmissions.workspace_id and w.owner_id=auth.uid() and w.kind='prime'
 ));

