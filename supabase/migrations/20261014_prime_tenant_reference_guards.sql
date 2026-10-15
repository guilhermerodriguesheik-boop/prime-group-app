-- Additional tenant and workspace reference protections for Premium.
-- Narrow existing policies only; existing financial records stay unchanged.
drop policy if exists bank_class_owner_all on public.prime_bank_classifications;
create policy bank_class_owner_all on public.prime_bank_classifications
 for all to authenticated
 using (
   user_id=(select auth.uid()) and exists (
     select 1 from public.bank_transactions bt
     where bt.id=bank_transaction_id and bt.owner_id=(select auth.uid())
   )
 )
 with check (
   user_id=(select auth.uid()) and exists (
     select 1 from public.bank_transactions bt
     where bt.id=bank_transaction_id and bt.owner_id=(select auth.uid())
   )
 );

drop policy if exists trip_workers_owner_all on public.prime_trip_workers;
create policy trip_workers_owner_all on public.prime_trip_workers
 for all to authenticated
 using (
   exists(
     select 1 from public.trips t
       join public.workspaces w on w.id=t.workspace_id
       join public.counterparties c on c.id=worker_id and c.workspace_id=t.workspace_id
     where t.id=trip_id and w.owner_id=(select auth.uid())
   )
 )
 with check (
   exists(
     select 1 from public.trips t
       join public.workspaces w on w.id=t.workspace_id
       join public.counterparties c on c.id=worker_id and c.workspace_id=t.workspace_id
     where t.id=trip_id and w.owner_id=(select auth.uid())
   )
 );

drop policy if exists recurring_bill_owner_all on public.prime_recurring_bills;
create policy recurring_bill_owner_all on public.prime_recurring_bills
 for all to authenticated
 using (
   exists(select 1 from public.workspaces w
     where w.id=workspace_id and w.owner_id=(select auth.uid()))
 )
 with check (
   exists(select 1 from public.workspaces w
     where w.id=workspace_id and w.owner_id=(select auth.uid()))
   and (counterparty_id is null or exists(
     select 1 from public.counterparties c
     where c.id=counterparty_id and c.workspace_id=workspace_id
   ))
 );
notify pgrst,'reload schema';
