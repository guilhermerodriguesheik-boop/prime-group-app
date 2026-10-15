-- A credencial OAuth só pode ser lida pelo backend service-role. Nenhuma policy pública.
create table if not exists public.fiscal_gmail_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  email text not null,
  encrypted_refresh_token text not null,
  next_page_token text,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text
);
alter table public.fiscal_gmail_connections enable row level security;
revoke all on public.fiscal_gmail_connections from anon, authenticated;
comment on table public.fiscal_gmail_connections is
 'OAuth gmail.readonly: token AES-256-GCM no backend; somente service role, nunca expor via Data API.';

create table if not exists public.fiscal_gmail_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  message_id text not null,
  cargo_reference text,
  ciot text,
  freight_value numeric(15,2),
  nfe_count int not null default 0,
  draft_id uuid references public.fiscal_drafts(id) on delete set null,
  imported_at timestamptz not null default now(),
  unique(workspace_id, message_id)
);
create index if not exists idx_fiscal_gmail_messages_workspace
  on public.fiscal_gmail_messages(workspace_id, imported_at desc);
alter table public.fiscal_gmail_messages enable row level security;
create policy fiscal_gmail_messages_owner_read on public.fiscal_gmail_messages
  for select to authenticated using (
    exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()))
  );
-- Writes only via restricted server-side service role after owner check.
revoke all on public.fiscal_gmail_messages from anon, authenticated;

-- Cadastros regulatórios são informações declaradas, sem falsa validação online.
create table if not exists public.fiscal_transport_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  rntrc text,
  rntrc_checked_at timestamptz,
  rntrc_check_notes text,
  updated_at timestamptz not null default now()
);
alter table public.fiscal_transport_profiles enable row level security;
create policy fiscal_transport_read on public.fiscal_transport_profiles for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy fiscal_transport_insert on public.fiscal_transport_profiles for insert to authenticated
  with check (public.can_edit_workspace(workspace_id));
create policy fiscal_transport_update on public.fiscal_transport_profiles for update to authenticated
  using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
