-- Prime Fiscal: somente entrada e rascunhos; nenhuma transmissao SEFAZ e realizada por esta migracao.
create table if not exists public.fiscal_nfe_inbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  source_kind text not null default 'manual' check (source_kind in ('manual','gmail')),
  source_id text,
  access_key text not null check (access_key ~ '^[0-9]{44}$'),
  invoice_number text not null,
  invoice_series text,
  issued_at timestamptz,
  sender_name text,
  sender_cnpj text,
  recipient_name text,
  recipient_cnpj text,
  origin_city text,
  origin_uf text,
  destination_city text,
  destination_uf text,
  goods_value numeric(15,2) not null check(goods_value >= 0),
  gross_weight_kg numeric(15,3),
  package_quantity numeric(15,3),
  cargo_reference text,
  xml_content text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,access_key)
);
create index if not exists idx_fiscal_nfe_workspace_created on public.fiscal_nfe_inbox(workspace_id,created_at desc);
alter table public.fiscal_nfe_inbox enable row level security;
create policy fiscal_nfe_select on public.fiscal_nfe_inbox for select to authenticated using(public.is_workspace_member(workspace_id));
create policy fiscal_nfe_insert on public.fiscal_nfe_inbox for insert to authenticated with check(public.can_edit_workspace(workspace_id) and created_by = (select auth.uid()));
create policy fiscal_nfe_update on public.fiscal_nfe_inbox for update to authenticated using(public.can_edit_workspace(workspace_id)) with check(public.can_edit_workspace(workspace_id));
create policy fiscal_nfe_delete on public.fiscal_nfe_inbox for delete to authenticated using(public.can_edit_workspace(workspace_id));

create table if not exists public.fiscal_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  document_type text not null check (document_type in ('cte','mdfe')),
  nfe_id uuid references public.fiscal_nfe_inbox(id) on delete restrict,
  trip_id uuid references public.trips(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  cargo_reference text,
  ciot text check(ciot is null or ciot ~ '^[0-9]{11,12}$'),
  freight_value numeric(15,2) check(freight_value is null or freight_value >= 0),
  status text not null default 'draft' check(status in ('draft','review_pending','approved_for_homologation','rejected','canceled')),
  checklist jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fiscal_drafts_workspace_created on public.fiscal_drafts(workspace_id,created_at desc);
alter table public.fiscal_drafts enable row level security;
create policy fiscal_drafts_select on public.fiscal_drafts for select to authenticated using(public.is_workspace_member(workspace_id));
create policy fiscal_drafts_insert on public.fiscal_drafts for insert to authenticated with check(public.can_edit_workspace(workspace_id) and created_by=(select auth.uid()));
create policy fiscal_drafts_update on public.fiscal_drafts for update to authenticated using(public.can_edit_workspace(workspace_id)) with check(public.can_edit_workspace(workspace_id));
create policy fiscal_drafts_delete on public.fiscal_drafts for delete to authenticated using(public.can_edit_workspace(workspace_id));

-- Na fase de emissao, tabela separada de documentos autorizados e sequencias, para
-- nunca confundir um rascunho com protocolo legal.
comment on table public.fiscal_drafts is 'Rascunhos de transporte; nao validos como CT-e/MDF-e emitidos.';
comment on table public.fiscal_nfe_inbox is 'XMLs NF-e recebidos da Ortobom ou importados pelo usuario. A validacao de assinatura digital requer etapa propria.';
