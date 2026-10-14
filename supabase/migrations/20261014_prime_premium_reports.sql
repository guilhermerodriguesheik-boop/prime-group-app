-- Reports use only settled/posted accounting rows; unreviewed bank transactions are excluded from profit.
-- Once per day, on Saturday and the last calendar day of the month in Brasilia.
create or replace function public.prime_queue_scheduled_reports(p_secret text)
returns int language plpgsql security definer set search_path=public as $$
declare
 today_br date:=(now() at time zone 'America/Sao_Paulo')::date;
 saturday boolean:=extract(isodow from today_br)=6;
 last_month_day boolean:=today_br=(date_trunc('month',today_br)+interval '1 month'-interval '1 day')::date;
 p record; env text; freq text; initial_date date;
 income_value numeric; expense_value numeric; open_in numeric;open_out numeric; overdue numeric;
 bank_pending bigint; trips_count bigint; top_expenses text; message text; inserted_count int:=0; insert_id uuid;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if not saturday and not last_month_day then return 0;end if;
 for p in select wp.user_id from public.whatsapp_pairings wp
  join public.prime_notification_settings s on s.user_id=wp.user_id
  where wp.enabled and wp.connected_at is not null and wp.phone_number ~ '^[0-9]{10,15}$'
 loop
  for freq in select * from unnest(array['weekly','monthly']) loop
   if (freq='weekly' and not saturday) or (freq='monthly' and not last_month_day)
     or (freq='weekly' and not(select s.weekly_reports from public.prime_notification_settings s where s.user_id=p.user_id))
     or (freq='monthly' and not(select s.monthly_reports from public.prime_notification_settings s where s.user_id=p.user_id))
   then continue;end if;
   initial_date:=case when freq='weekly' then (today_br-(extract(isodow from today_br)::int-1))
                        else date_trunc('month',today_br)::date end;
   for env in select * from unnest(array['prime','personal']) loop
    select coalesce(sum(case when t.type='income' then
       case when t.source='loan' then coalesce((t.metadata->>'loan_interest')::numeric,0)+coalesce((t.metadata->>'loan_fees')::numeric,0)
        else t.amount end else 0 end),0),
       coalesce(sum(case when t.type='expense' and t.source<>'loan' then t.amount else 0 end),0)
    into income_value,expense_value from public.transactions t join public.workspaces w on w.id=t.workspace_id
    where w.owner_id=p.user_id and w.kind=env and t.status in ('posted','reconciled')
      and (t.occurred_at at time zone 'America/Sao_Paulo')::date between initial_date and today_br;
    select coalesce(sum(greatest(r.amount-r.received_amount,0)),0) into open_in
     from public.receivables r join public.workspaces w on w.id=r.workspace_id
     where w.owner_id=p.user_id and w.kind=env and r.status in('open','partial','overdue');
    select coalesce(sum(greatest(a.amount-a.paid_amount,0)),0),
           coalesce(sum(case when a.due_date<today_br then greatest(a.amount-a.paid_amount,0) else 0 end),0)
    into open_out,overdue
     from public.payables a join public.workspaces w on w.id=a.workspace_id
     where w.owner_id=p.user_id and w.kind=env and a.status in('open','partial','overdue');
    select count(*) into bank_pending from public.bank_transactions bt join public.workspaces w on w.id=bt.workspace_id
     where w.owner_id=p.user_id and w.kind=env and bt.review_status='pending'
       and bt.occurred_on between initial_date and today_br;
    select count(*) into trips_count from public.trips t join public.workspaces w on w.id=t.workspace_id
     where w.owner_id=p.user_id and w.kind=env and t.status='completed' and t.service_date between initial_date and today_br;
    select string_agg(left(row.description,55)||' R$ '||to_char(row.value,'FM999G999G990D00'),E'\n')
    into top_expenses from (
      select t.description,sum(t.amount) value from public.transactions t join public.workspaces w on w.id=t.workspace_id
      where w.owner_id=p.user_id and w.kind=env and t.type='expense' and t.source<>'loan'
       and t.status in('posted','reconciled')
       and (t.occurred_at at time zone 'America/Sao_Paulo')::date between initial_date and today_br
      group by t.description order by value desc limit 5
    ) row;
    message:='Prime Finance · '||case when env='prime' then 'Prime Group' else 'Pessoal' end||
      ' · '||case when freq='weekly' then 'Semanal' else 'Mensal' end||
      E'\nPeríodo: '||to_char(initial_date,'DD/MM/YYYY')||' a '||to_char(today_br,'DD/MM/YYYY')||
      E'\nRecebido / lançado: R$ '||to_char(income_value,'FM999G999G990D00')||
      E'\nGasto / lançado: R$ '||to_char(expense_value,'FM999G999G990D00')||
      E'\nResultado registrado: R$ '||to_char(income_value-expense_value,'FM999G999G990D00')||
      E'\nA receber (aberto): R$ '||to_char(open_in,'FM999G999G990D00')||
      E'\nA pagar (aberto): R$ '||to_char(open_out,'FM999G999G990D00')||
      E'\nEm atraso: R$ '||to_char(overdue,'FM999G999G990D00')||
      E'\nMovimentações bancárias não conferidas no período: '||bank_pending||
      case when env='prime' then E'\nFretes concluídos no período: '||trips_count else '' end||
      case when top_expenses is not null then E'\nMaiores despesas registradas:\n'||top_expenses else '' end||
      E'\n\nApuração parcial até a hora do envio: não inclui extratos ainda sem conciliação,'||
      ' fretes não recebidos nem gastos não lançados. Resultado gerencial não é lucro contábil/fiscal.';
    insert into public.prime_outbox(user_id,dedupe_key,category,message)
    values(p.user_id,'report:'||p.user_id||':'||env||':'||freq||':'||today_br,'report',left(message,3900))
    on conflict(dedupe_key) do nothing returning id into insert_id;
    if insert_id is not null then inserted_count:=inserted_count+1;end if;
    insert_id:=null;
   end loop;
  end loop;
 end loop;
 return inserted_count;
end $$;
revoke all on function public.prime_queue_scheduled_reports(text) from public;
grant execute on function public.prime_queue_scheduled_reports(text) to anon,authenticated;
notify pgrst,'reload schema';
