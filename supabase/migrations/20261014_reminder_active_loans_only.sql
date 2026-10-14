-- Only funded and active loan contracts are eligible for scheduled WhatsApp alerts.
create or replace function public.prime_claim_reminder_notifications(p_secret text,p_limit integer default 24)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare today_br date := (now() at time zone 'America/Sao_Paulo')::date;
result jsonb;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 with candidates as (
   select w.owner_id user_id,'payable'::text source_kind,p.id source_id,
     p.due_date,left(p.description,180) description,
     greatest(0,p.amount-coalesce(p.paid_amount,0)) amount,w.kind workspace_kind
   from public.payables p join public.workspaces w on w.id=p.workspace_id
   where p.status in ('open','partial','overdue') and p.amount>coalesce(p.paid_amount,0)
   union all
   select w.owner_id,'receivable',r.id,r.due_date,left(r.description,180),
     greatest(0,r.amount-coalesce(r.received_amount,0)),w.kind
   from public.receivables r join public.workspaces w on w.id=r.workspace_id
   where r.status in ('open','partial','overdue') and r.amount>coalesce(r.received_amount,0)
   union all
   select m.user_id,'manual',m.id,m.due_date,left(m.description,180),
     greatest(0,coalesce(m.amount,0)),w.kind
   from public.payment_reminders m join public.workspaces w on w.id=m.workspace_id and w.owner_id=m.user_id
   where m.status='pending' and m.payable_id is null
   union all
   select w.owner_id,'loan_installment',i.id,i.due_date,
     left('Parcela de empréstimo · '||coalesce(cp.name,'Contrato'),180),
     greatest(0,coalesce(i.principal_due,0)+coalesce(i.interest_due,0)+coalesce(i.fees_due,0)-coalesce(i.paid_amount,0)),
     w.kind
   from public.loan_installments i join public.loans l on l.id=i.loan_id
   join public.workspaces w on w.id=l.workspace_id
   left join public.counterparties cp on cp.id=l.counterparty_id
   where l.status='active' and coalesce(i.status,'open') not in ('paid','cancelled','settled')
     and (coalesce(i.principal_due,0)+coalesce(i.interest_due,0)+coalesce(i.fees_due,0))>coalesce(i.paid_amount,0)
   union all
   select w.owner_id,'loan_due',l.id,l.maturity_date,
      left('Capital do empréstimo · '||coalesce(cp.name,'Contrato'),180),
      greatest(0,l.principal-coalesce(lp.principal_paid,0)),w.kind
   from public.loans l join public.workspaces w on w.id=l.workspace_id
   left join public.counterparties cp on cp.id=l.counterparty_id
   left join lateral(select sum(principal_amount) principal_paid from public.loan_payments where loan_id=l.id) lp on true
   where l.status='active' and l.maturity_date is not null and l.principal>coalesce(lp.principal_paid,0)
     and not exists(select 1 from public.loan_installments i where i.loan_id=l.id and i.due_date=l.maturity_date)
 ), inserted as (
  insert into public.whatsapp_reminder_deliveries
    (user_id,source_kind,source_id,due_date,stage,description,amount,workspace_kind)
  select c.user_id,c.source_kind,c.source_id,c.due_date,
    case when c.due_date=today_br then 'today' else 'before3' end,
    c.description,c.amount,c.workspace_kind
  from candidates c
  join public.whatsapp_reminder_preferences preference on preference.user_id=c.user_id and preference.enabled
  join public.whatsapp_pairings pair on pair.user_id=c.user_id and pair.enabled and pair.connected_at is not null
  where pair.phone_number ~ '^[0-9]{10,15}$'
    and c.due_date in (today_br,today_br+3)
  on conflict do nothing returning id
 ), claimed as (
  select d.id from public.whatsapp_reminder_deliveries d
  join public.whatsapp_reminder_preferences preference on preference.user_id=d.user_id and preference.enabled
  join public.whatsapp_pairings pair on pair.user_id=d.user_id and pair.enabled and pair.connected_at is not null
  where pair.phone_number ~ '^[0-9]{10,15}$'
    and (d.status in ('pending','retry')
      or (d.status='processing' and d.processing_started_at<now()-interval '20 minutes'))
    and d.attempts<4
  order by d.created_at,d.id for update of d skip locked
  limit least(greatest(coalesce(p_limit,24),1),40)
 ), updated as (
  update public.whatsapp_reminder_deliveries d
  set status='processing',attempts=d.attempts+1,processing_started_at=now(),last_error=null
  where d.id in (select id from claimed)
  returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'phone',pair.phone_number,'description',d.description,
   'amount',d.amount,'dueDate',d.due_date,'stage',d.stage,
   'kind',d.source_kind,'workspace',d.workspace_kind
 ) order by d.created_at),'[]'::jsonb) into result
 from updated d join public.whatsapp_pairings pair on pair.user_id=d.user_id;
 return result;
end
$$;

