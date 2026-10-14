-- Correct column qualification in cross-workspace counterparty guard.
-- The comparison must use the outer recurring bill workspace, not self-compare the counterparty.
drop policy if exists recurring_bill_owner_all on public.prime_recurring_bills;
create policy recurring_bill_owner_all on public.prime_recurring_bills
 for all to authenticated
 using (
   exists(select 1 from public.workspaces w
     where w.id=prime_recurring_bills.workspace_id
       and w.owner_id=(select auth.uid()))
 )
 with check (
   exists(select 1 from public.workspaces w
     where w.id=prime_recurring_bills.workspace_id
       and w.owner_id=(select auth.uid()))
   and (prime_recurring_bills.counterparty_id is null or exists(
     select 1 from public.counterparties c
     where c.id=prime_recurring_bills.counterparty_id
       and c.workspace_id=prime_recurring_bills.workspace_id
   ))
 );
notify pgrst,'reload schema';
