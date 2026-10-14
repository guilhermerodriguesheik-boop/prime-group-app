-- Reversible unlink keeps historical statement data, hard delete cascades to bank_accounts/transactions.
alter table public.bank_connections
  add column if not exists archived_at timestamptz;
create index if not exists bank_connections_owner_active_idx
  on public.bank_connections(owner_id,archived_at);

-- Only a signed-in owner with access to the corresponding workspace may delete.
-- Child rows are removed by the existing foreign-key ON DELETE CASCADE.
drop policy if exists bank_connections_owner_delete on public.bank_connections;
create policy bank_connections_owner_delete on public.bank_connections
  for delete to authenticated
  using (owner_id=(select auth.uid()) and exists (
    select 1 from public.workspaces w
    where w.id=bank_connections.workspace_id and w.owner_id=(select auth.uid())
  ));
grant delete on public.bank_connections to authenticated;
notify pgrst, 'reload schema';
