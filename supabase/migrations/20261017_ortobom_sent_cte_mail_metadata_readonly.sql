create table if not exists public.ortobom_cte_email_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  message_id text not null,
  cargo_reference text,
  sender text not null,
  recipient text not null,
  subject text not null,
  email_date timestamptz,
  attachment_names jsonb not null default '[]'::jsonb,
  has_pdf boolean not null default false,
  has_xml boolean not null default false,
  cte_number text,
  cte_series text,
  cte_key text,
  evidence_status text not null default 'document_attached_unverified'
    check(evidence_status in ('document_attached_unverified','xml_authorization_claim_unverified')),
  imported_at timestamptz not null default now(),
  unique(workspace_id,message_id)
);
create index if not exists ortobom_cte_email_documents_workspace_date_idx
  on public.ortobom_cte_email_documents(workspace_id,email_date desc);
create index if not exists ortobom_cte_email_documents_workspace_cargo_idx
  on public.ortobom_cte_email_documents(workspace_id,cargo_reference);
alter table public.ortobom_cte_email_documents enable row level security;
revoke all on public.ortobom_cte_email_documents from anon,authenticated;
grant select on public.ortobom_cte_email_documents to authenticated;
create policy "Prime owner reads own sent CT-e email metadata"
  on public.ortobom_cte_email_documents for select to authenticated
  using (exists(select 1 from public.workspaces w where
    w.id=workspace_id and w.owner_id=(select auth.uid()) and w.kind='prime'));
alter table public.fiscal_gmail_connections
  add column if not exists cte_next_page_token text;
alter table public.fiscal_gmail_connections
  add column if not exists cte_last_sync_at timestamptz;
