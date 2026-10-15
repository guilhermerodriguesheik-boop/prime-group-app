-- Multiple recurrence frequencies without changing settled historical obligations.
alter table public.prime_recurring_bills
 add column if not exists frequency text not null default 'monthly';
alter table public.prime_recurring_bills drop constraint if exists prime_recurring_bills_frequency_check;
alter table public.prime_recurring_bills add constraint prime_recurring_bills_frequency_check
 check(frequency in ('weekly','monthly','quarterly','yearly'));

create or replace function public.prime_materialize_bills(p_secret text)
returns integer language plpgsql security definer set search_path=public as $$
declare today_br date:=(now() at time zone 'America/Sao_Paulo')::date;
 target_month date;
 last_day int;
 due date;
 b record;
 target_payable uuid;
 counter integer:=0;
 period_number int;
 month_diff int;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 for b in select * from public.prime_recurring_bills where active loop
  if b.frequency='weekly' then
   if b.due_day>7 then continue; end if;
   for period_number in 0..8 loop
    due=date_trunc('week',today_br)::date+(7*period_number)+(b.due_day-1);
    if due<b.starts_on or (b.ends_on is not null and due>b.ends_on) then continue;end if;
    if exists(select 1 from public.prime_bill_occurrences where bill_id=b.id and due_date=due) then continue;end if;
    insert into public.payables(workspace_id,counterparty_id,description,amount,due_date,status)
    values(b.workspace_id,b.counterparty_id,b.description,b.amount,due,'open') returning id into target_payable;
    insert into public.prime_bill_occurrences(bill_id,due_date,payable_id) values(b.id,due,target_payable);
    counter=counter+1;
   end loop;
  else
   for period_number in 0..2 loop
    target_month=(date_trunc('month',today_br)+make_interval(months=>period_number))::date;
    month_diff=(extract(year from target_month)::int-extract(year from b.starts_on)::int)*12+
               extract(month from target_month)::int-extract(month from b.starts_on)::int;
    if month_diff<0 or (b.frequency='quarterly' and mod(month_diff,3)<>0)
       or (b.frequency='yearly' and mod(month_diff,12)<>0) then continue;end if;
    last_day=extract(day from (target_month+interval '1 month'-interval '1 day'))::int;
    due=target_month+(least(last_day,b.due_day)-1);
    if due<b.starts_on or (b.ends_on is not null and due>b.ends_on) then continue;end if;
    if exists(select 1 from public.prime_bill_occurrences where bill_id=b.id and due_date=due) then continue;end if;
    insert into public.payables(workspace_id,counterparty_id,description,amount,due_date,status)
    values(b.workspace_id,b.counterparty_id,b.description,b.amount,due,'open') returning id into target_payable;
    insert into public.prime_bill_occurrences(bill_id,due_date,payable_id) values(b.id,due,target_payable);
    counter=counter+1;
   end loop;
  end if;
 end loop;
 return counter;
end $$;
revoke all on function public.prime_materialize_bills(text) from public;
grant execute on function public.prime_materialize_bills(text) to anon,authenticated;
notify pgrst,'reload schema';
