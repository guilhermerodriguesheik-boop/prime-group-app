-- Friday operating settlement preview, delivered only to the account owner.
-- The user manually reviews and forwards each individual worker statement.
create or replace function public.prime_queue_friday_payroll(p_secret text)
returns integer language plpgsql security definer set search_path=public as $$
declare today_br date:=(now() at time zone 'America/Sao_Paulo')::date;
 week_start date:=date_trunc('week',(now() at time zone 'America/Sao_Paulo'))::date;
 u record;details text;total numeric;count_jobs int; new_id uuid; n int:=0;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if extract(isodow from today_br)<>5 then return 0;end if;
 for u in
  select p.user_id from public.whatsapp_pairings p join public.prime_notification_settings pref on pref.user_id=p.user_id
  where p.enabled and p.connected_at is not null and pref.weekly_reports
 loop
  select coalesce(sum(tw.amount),0),count(*) into total,count_jobs
  from public.prime_trip_workers tw
  join public.trips t on t.id=tw.trip_id
  join public.workspaces w on w.id=t.workspace_id
  where w.owner_id=u.user_id and w.kind='prime'
    and t.status='completed' and t.service_date between week_start and today_br;
  if count_jobs=0 then continue;end if;
  select string_agg(detail, E'\n' order by worker_name) into details
  from (
    select c.name worker_name, left(c.name,60)||' · '||count(*)||' serviços / '||
      count(distinct t.service_date)||' dias · R$ '||to_char(sum(tw.amount),'FM999G999G990D00') detail
    from public.prime_trip_workers tw
    join public.trips t on t.id=tw.trip_id
    join public.counterparties c on c.id=tw.worker_id
    join public.workspaces w on w.id=t.workspace_id
    where w.owner_id=u.user_id and w.kind='prime'
      and t.status='completed' and t.service_date between week_start and today_br
    group by c.id,c.name
  ) report;
  insert into public.prime_outbox(user_id,dedupe_key,category,message)
  values(u.user_id,'payroll:'||u.user_id||':'||today_br,'report',
    left('Prime Finance · Prévia de pagamento da equipe'||E'\n'||
     to_char(week_start,'DD/MM')||' a '||to_char(today_br,'DD/MM/YYYY')||
     E'\nTotal combinado: R$ '||to_char(total,'FM999G999G990D00')||
     E'\n' || details ||
     E'\n\nConfirme os dias e fretes em Equipe no Prime Finance e envie os demonstrativos individuais. '||
     'Este resumo não comprova que os profissionais foram pagos.',3900))
  on conflict(dedupe_key) do nothing returning id into new_id;
  if new_id is not null then n=n+1;end if;
  new_id:=null;
 end loop;
 return n;
end $$;
revoke all on function public.prime_queue_friday_payroll(text) from public;
grant execute on function public.prime_queue_friday_payroll(text) to anon,authenticated;
notify pgrst,'reload schema';
