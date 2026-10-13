-- Qualify outer columns: the old inner c.workspace_id=workspace_id resolved
-- to c.workspace_id=c.workspace_id and did not enforce workspace isolation.
alter policy bank_accounts_owner_all on public.bank_accounts
using (owner_id=(select auth.uid()) and exists (
  select 1 from public.bank_connections c
  where c.id=bank_accounts.connection_id and c.owner_id=(select auth.uid())
    and c.workspace_id=bank_accounts.workspace_id
))
with check (owner_id=(select auth.uid()) and exists (
  select 1 from public.bank_connections c
  where c.id=bank_accounts.connection_id and c.owner_id=(select auth.uid())
    and c.workspace_id=bank_accounts.workspace_id
));
alter policy bank_transactions_owner_all on public.bank_transactions
using (owner_id=(select auth.uid()) and exists (
  select 1 from public.bank_accounts a
  where a.id=bank_transactions.bank_account_id and a.owner_id=(select auth.uid())
    and a.workspace_id=bank_transactions.workspace_id
))
with check (owner_id=(select auth.uid()) and exists (
  select 1 from public.bank_accounts a
  where a.id=bank_transactions.bank_account_id and a.owner_id=(select auth.uid())
    and a.workspace_id=bank_transactions.workspace_id
));
notify pgrst, 'reload schema';
