-- Read-only rollup of bank movements by their manually selected purpose.
create or replace function public.prime_bank_area_stats()
returns table(destination text,label text,movements bigint,inflows numeric,outflows numeric)
language sql stable security invoker set search_path=public,pg_temp as $$
with names(destination,label) as (values
 ('prime','Empresa'),('personal','Pessoal'),('interest','Empréstimo'),
 ('transfer','Transferência'),('pending','Não classificado')),
totals as (
 select case when c.destination in ('prime','personal','interest','transfer')
   then c.destination else 'pending' end as destination,
 count(*) as movements,
 coalesce(sum(t.amount) filter(where t.direction='credit'),0) as inflows,
 coalesce(sum(t.amount) filter(where t.direction='debit'),0) as outflows
 from public.bank_transactions t
 join public.bank_accounts a on a.id=t.bank_account_id
  and a.owner_id=t.owner_id and a.workspace_id=t.workspace_id
 join public.workspaces w on w.id=t.workspace_id and w.owner_id=t.owner_id
 left join public.prime_bank_classifications c on c.bank_transaction_id=t.id and c.user_id=t.owner_id
 where t.owner_id=(select auth.uid()) and t.provider_status='POSTED'
  and a.kind='BANK' and a.currency='BRL'
 group by 1
)
select n.destination,n.label,coalesce(t.movements,0),coalesce(t.inflows,0),coalesce(t.outflows,0)
from names n left join totals t using(destination)
order by case n.destination when 'prime' then 1 when 'personal' then 2
 when 'interest' then 3 when 'transfer' then 4 else 5 end;
$$;
revoke all on function public.prime_bank_area_stats() from public,anon;
grant execute on function public.prime_bank_area_stats() to authenticated;
