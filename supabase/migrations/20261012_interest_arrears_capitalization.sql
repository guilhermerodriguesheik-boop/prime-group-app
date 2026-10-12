-- Interest-only loans: contractual late fee per overdue day and
-- capitalization of unpaid interest/fees only at subsequent monthly due dates.
-- Existing contracts retain zero late fee and no capitalization until specifically enabled.
alter table public.loans
  add column if not exists late_fee_daily numeric(14,2) not null default 0,
  add column if not exists capitalize_overdue boolean not null default false;
alter table public.loans
  add constraint loans_late_fee_nonnegative_check
  check (late_fee_daily >= 0 and late_fee_daily <= 100000);

-- New contract route; keep legacy function for compatibility with old clients.
create or replace function public.create_interest_only_loan_v2(
  p_workspace_id uuid,
  p_borrower_name text,
  p_principal numeric,
  p_monthly_rate numeric,
  p_start_date date,
  p_first_due_date date,
  p_action_id uuid,
  p_record_disbursement boolean default true,
  p_account_id uuid default null,
  p_notes text default null,
  p_final_maturity_date date default null,
  p_late_fee_daily numeric default 10,
  p_capitalize_overdue boolean default true
) returns uuid
language plpgsql security invoker set search_path=''
as $function$
declare v_id uuid;
begin
  if p_late_fee_daily is null or p_late_fee_daily < 0 then
    raise exception 'Valor diário de atraso deve ser zero ou positivo';
  end if;
  v_id := public.create_interest_only_loan(
    p_workspace_id,p_borrower_name,p_principal,p_monthly_rate,
    p_start_date,p_first_due_date,p_action_id,p_record_disbursement,
    p_account_id,p_notes,p_final_maturity_date
  );
  update public.loans
     set late_fee_daily=round(p_late_fee_daily,2),
         capitalize_overdue=coalesce(p_capitalize_overdue,false),
         updated_at=now()
   where id=v_id and workspace_id=p_workspace_id;
  return v_id;
end;
$function$;

-- Reconstruct debt by chronological monthly due dates and actual payments:
-- late fee starts the calendar day AFTER a missed due date;
-- accrued fee stops when all overdue interest has been paid;
-- at the next monthly due date, unpaid interest and penalties form the new rate base.
-- Monthly payments of interest leave principal untouched.
create or replace function public.interest_only_loan_breakdown(
  p_loan_id uuid,
  p_as_of date default (timezone('America/Sao_Paulo',now()))::date
) returns table (
  principal_outstanding numeric,
  monthly_interest numeric,
  accrued_interest_due numeric,
  late_fees_due numeric,
  payoff_due numeric,
  compound_base numeric,
  next_interest_due_date date,
  last_interest_due_date date,
  overdue_fee_days integer
)
language plpgsql stable security invoker set search_path=''
as $function$
declare
  l public.loans%rowtype;
  ev record;
  v_principal numeric;
  v_interest numeric := 0;
  v_fees numeric := 0;
  v_cursor date;
  v_last_due date := null;
  v_due_count integer := 0;
  v_fee_days integer := 0;
  v_days integer;
  v_interest_charge numeric;
  v_effective_date date;
  v_closed date;
begin
  select * into l from public.loans where id=p_loan_id;
  if not found then raise exception 'Empréstimo não encontrado'; end if;
  if auth.uid() is null or not public.is_workspace_member(l.workspace_id) then
    raise exception 'Sem permissão para esse empréstimo';
  end if;
  if not l.interest_only then raise exception 'Empréstimo não é da modalidade de juros mensais'; end if;
  if p_as_of is null or p_as_of < l.start_date then
    raise exception 'Data da consulta anterior ao empréstimo';
  end if;
  if p_as_of > (l.start_date + interval '40 years')::date then
    raise exception 'Prazo acima de 40 anos não está disponível para consulta';
  end if;

  v_effective_date := p_as_of;
  if l.status='settled' then
    select max((paid_at at time zone 'America/Sao_Paulo')::date)
      into v_closed from public.loan_payments where loan_id=p_loan_id;
    if v_closed is not null then v_effective_date := least(p_as_of,v_closed); end if;
  end if;
  v_cursor := l.start_date;
  v_principal := l.principal;

  for ev in
    select event_date,
           sum(due_event)::integer as due_event,
           sum(principal_paid) as principal_paid,
           sum(interest_paid) as interest_paid,
           sum(fee_paid) as fee_paid
      from (
        select (l.first_interest_due_date + make_interval(months=>n))::date as event_date,
               1::integer as due_event,
               0::numeric as principal_paid,0::numeric as interest_paid,0::numeric as fee_paid
          from generate_series(0,479) as n
         where (l.first_interest_due_date + make_interval(months=>n))::date <= v_effective_date
        union all
        select (p.paid_at at time zone 'America/Sao_Paulo')::date,
               0,p.principal_amount,p.interest_amount,p.fees_amount
          from public.loan_payments p
         where p.loan_id=p_loan_id
           and (p.paid_at at time zone 'America/Sao_Paulo')::date <= v_effective_date
        union all
        select v_effective_date,0,0::numeric,0::numeric,0::numeric
      ) events
     where event_date >= l.start_date
     group by event_date
     order by event_date
  loop
    if v_last_due is not null and v_interest > 0 and ev.event_date > v_cursor then
      v_days := ev.event_date - greatest(v_cursor,v_last_due);
      if v_days > 0 then
        v_fees := v_fees + v_days*l.late_fee_daily;
        v_fee_days := v_fee_days + v_days;
      end if;
    end if;

    if ev.due_event > 0 then
      v_interest_charge := round((
        v_principal +
        case when l.capitalize_overdue then v_interest+v_fees else 0 end
      ) * l.periodic_rate/100,2);
      v_interest := v_interest + v_interest_charge;
      v_last_due := ev.event_date;
      v_due_count := v_due_count + ev.due_event;
    end if;

    v_principal := v_principal - ev.principal_paid;
    v_interest := v_interest - ev.interest_paid;
    v_fees := v_fees - ev.fee_paid;
    if least(v_principal,v_interest,v_fees) < -0.01 then
      raise exception 'Pagamentos históricos ultrapassaram saldo do empréstimo';
    end if;
    v_principal := greatest(0,v_principal);
    v_interest := greatest(0,v_interest);
    v_fees := greatest(0,v_fees);
    v_cursor := ev.event_date;
  end loop;

  principal_outstanding := round(v_principal,2);
  accrued_interest_due := round(v_interest,2);
  late_fees_due := round(v_fees,2);
  payoff_due := round(v_principal+v_interest+v_fees,2);
  compound_base := round(v_principal + case when l.capitalize_overdue then v_interest+v_fees else 0 end,2);
  monthly_interest := round(compound_base*l.periodic_rate/100,2);
  next_interest_due_date := case when l.status='settled' or payoff_due=0 then null
    else (l.first_interest_due_date+make_interval(months=>v_due_count))::date end;
  last_interest_due_date := v_last_due;
  overdue_fee_days := v_fee_days;
  return next;
end;
$function$;

-- Preserve the six-field signature used by prior integrations and repayment tools.
create or replace function public.interest_only_loan_state(
  p_loan_id uuid,
  p_as_of date default (timezone('America/Sao_Paulo',now()))::date
) returns table(
  principal_outstanding numeric,
  monthly_interest numeric,
  accrued_interest_due numeric,
  payoff_due numeric,
  next_interest_due_date date,
  last_interest_due_date date
)
language sql stable security invoker set search_path=''
as $function$
 select b.principal_outstanding,b.monthly_interest,b.accrued_interest_due,
        b.payoff_due,b.next_interest_due_date,b.last_interest_due_date
 from public.interest_only_loan_breakdown(p_loan_id,p_as_of) b;
$function$;

-- The expanded view is authorization-filtered by security_invoker and RPC checks.
-- Adding columns at end preserves existing SELECT clients.
create or replace view public.interest_only_loan_status with (security_invoker=true) as
with relevant as materialized (
  select id,workspace_id from public.loans where interest_only and status in ('active','settled')
)
select l.id as loan_id,l.workspace_id,
       b.principal_outstanding,b.monthly_interest,b.accrued_interest_due,
       b.payoff_due,b.next_interest_due_date,b.last_interest_due_date,
       b.late_fees_due,b.compound_base,b.overdue_fee_days
  from relevant l
 cross join lateral public.interest_only_loan_breakdown(
   l.id,(timezone('America/Sao_Paulo',now()))::date
 ) b;

-- Payment records capture fees in loan_payments.fees_amount, interest and principal
-- in their respective columns. No accrued charge counts as earned revenue.
create or replace function public.register_interest_only_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_mode text,
  p_paid_on date,
  p_action_id uuid,
  p_account_id uuid default null,
  p_notes text default null,
  p_principal_part numeric default null,
  p_interest_part numeric default null,
  p_distinct_event boolean default false,
  p_fee_part numeric default null
) returns jsonb
language plpgsql security invoker set search_path=''
as $function$
declare
  l public.loans%rowtype;
  b record;
  after_payment record;
  v_capital numeric := 0;
  v_interest numeric := 0;
  v_fee numeric := 0;
  v_borrower text;
  v_tx uuid;
  v_payment_id uuid;
  v_today date := (timezone('America/Sao_Paulo',now()))::date;
begin
  if p_amount is null or p_amount <= 0 or p_paid_on is null or p_action_id is null then
    raise exception 'Informe valor e data do recebimento';
  end if;
  select * into l from public.loans where id=p_loan_id for update;
  if not found then raise exception 'Empréstimo não encontrado'; end if;
  if auth.uid() is null or not public.can_edit_workspace(l.workspace_id) then
    raise exception 'Sem permissão';
  end if;
  if not l.interest_only or l.direction <> 'receivable' then
    raise exception 'Contrato não é de juros mensais';
  end if;
  select id into v_payment_id from public.loan_payments
    where external_action_id=p_action_id::text;
  if v_payment_id is not null then
    return jsonb_build_object('paymentId',v_payment_id,'reused',true);
  end if;
  if l.status <> 'active' then raise exception 'Contrato não está ativo para recebimento'; end if;
  if p_paid_on < l.start_date or p_paid_on>v_today then
    raise exception 'Pagamento deve estar entre o início do contrato e a data atual';
  end if;
  if exists(
    select 1 from public.loan_payments
     where loan_id=p_loan_id and
       (paid_at at time zone 'America/Sao_Paulo')::date > p_paid_on
  ) then raise exception 'Não é possível inserir retroativamente antes de pagamentos posteriores'; end if;
  if p_account_id is not null and not exists(
    select 1 from public.accounts where id=p_account_id
      and workspace_id=l.workspace_id and active
  ) then raise exception 'Conta informada não pertence ao ambiente Juros'; end if;

  select * into b from public.interest_only_loan_breakdown(p_loan_id,p_paid_on);
  if p_mode='interest' then
    v_interest := p_amount;
  elsif p_mode='principal' then
    v_capital := p_amount;
  elsif p_mode='fees' then
    v_fee := p_amount;
  elsif p_mode='settlement' then
    v_capital := b.principal_outstanding;
    v_interest := b.accrued_interest_due;
    v_fee := b.late_fees_due;
    if round(p_amount,2)<>b.payoff_due then
      raise exception 'TOTAL_QUITACAO_DIVERGENTE: saldo na data R$ %, incluindo R$ % de multa diária',
        b.payoff_due,b.late_fees_due;
    end if;
  elsif p_mode='split' then
    if p_principal_part is null or p_interest_part is null or p_fee_part is null then
      raise exception 'Informe quanto é capital, juros e taxa de atraso';
    end if;
    v_capital := p_principal_part;
    v_interest := p_interest_part;
    v_fee := p_fee_part;
  else
    raise exception 'Modo inválido para pagamento de empréstimo';
  end if;

  if least(v_capital,v_interest,v_fee) < 0 or
    round(v_capital+v_interest+v_fee,2)<>round(p_amount,2) then
    raise exception 'Valores de capital, juros e multa não conferem com total recebido';
  end if;
  if v_capital>b.principal_outstanding or
     v_interest>b.accrued_interest_due or v_fee>b.late_fees_due then
    raise exception 'Valor recebido supera o saldo em aberto de capital, juros ou multa';
  end if;
  if not p_distinct_event and exists(
    select 1 from public.loan_payments
     where loan_id=p_loan_id
       and (paid_at at time zone 'America/Sao_Paulo')::date=p_paid_on
       and amount=round(p_amount,2)
       and principal_amount=v_capital and interest_amount=v_interest
       and fees_amount=v_fee
  ) then raise exception 'POSSIBLE_DUPLICATE_PAYMENT: pagamento igual já existe nessa data'; end if;

  select name into v_borrower from public.counterparties where id=l.counterparty_id;
  insert into public.transactions(
    workspace_id,account_id,counterparty_id,type,amount,occurred_at,
    description,status,source,external_id,metadata,created_by
  ) values(
    l.workspace_id,p_account_id,l.counterparty_id,'income',round(p_amount,2),
    (p_paid_on::text || ' 12:00:00-03')::timestamptz,
    'Recebimento de empréstimo: ' || coalesce(v_borrower,'Devedor'),
    'posted','loan','interest_only_payment:'||p_action_id::text,
    jsonb_build_object('loan_cashflow','repayment','loan_id',p_loan_id,
      'loan_principal',v_capital,'loan_interest',v_interest,'loan_fees',v_fee),
    auth.uid()
  ) returning id into v_tx;

  insert into public.loan_payments(
    loan_id,paid_at,amount,principal_amount,interest_amount,fees_amount,
    notes,transaction_id,external_action_id
  ) values(
    p_loan_id,(p_paid_on::text || ' 12:00:00-03')::timestamptz,
    round(p_amount,2),v_capital,v_interest,v_fee,p_notes,v_tx,p_action_id::text
  ) returning id into v_payment_id;

  select * into after_payment
    from public.interest_only_loan_breakdown(p_loan_id,p_paid_on);
  if after_payment.payoff_due=0 then
    update public.loans set status='settled',updated_at=now() where id=p_loan_id;
  end if;
  return jsonb_build_object(
    'paymentId',v_payment_id,'loanId',p_loan_id,
    'principalPaid',v_capital,'interestPaid',v_interest,'lateFeePaid',v_fee,
    'principalRemaining',after_payment.principal_outstanding,
    'interestOverdue',after_payment.accrued_interest_due,
    'lateFeesDue',after_payment.late_fees_due,
    'monthlyInterestNext',after_payment.monthly_interest,
    'payoffDue',after_payment.payoff_due,
    'loanSettled',after_payment.payoff_due=0
  );
end;
$function$;

-- The older ten-argument RPC remains callable but rejects penalty-bearing
-- loans to prevent historical clients from ignoring the late fee balance.
create or replace function public.register_interest_only_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_mode text,
  p_paid_on date,
  p_action_id uuid,
  p_account_id uuid default null,
  p_notes text default null,
  p_principal_part numeric default null,
  p_interest_part numeric default null,
  p_distinct_event boolean default false
) returns jsonb
language plpgsql security invoker set search_path=''
as $function$
declare v_loan public.loans%rowtype;
begin
  select * into v_loan from public.loans where id=p_loan_id;
  if not found then raise exception 'Empréstimo não encontrado'; end if;
  if v_loan.late_fee_daily>0 or v_loan.capitalize_overdue then
    raise exception 'Atualize o aplicativo para registrar multa diária e juros sobre atraso corretamente';
  end if;
  return public.register_interest_only_payment(
    p_loan_id,p_amount,p_mode,p_paid_on,p_action_id,p_account_id,
    p_notes,p_principal_part,p_interest_part,p_distinct_event,0
  );
end;
$function$;

revoke all on function public.create_interest_only_loan_v2(uuid,text,numeric,numeric,date,date,uuid,boolean,uuid,text,date,numeric,boolean) from public,anon;
revoke all on function public.interest_only_loan_breakdown(uuid,date) from public,anon;
revoke all on function public.register_interest_only_payment(uuid,numeric,text,date,uuid,uuid,text,numeric,numeric,boolean,numeric) from public,anon;
grant execute on function public.create_interest_only_loan_v2(uuid,text,numeric,numeric,date,date,uuid,boolean,uuid,text,date,numeric,boolean) to authenticated;
grant execute on function public.interest_only_loan_breakdown(uuid,date) to authenticated;
grant execute on function public.register_interest_only_payment(uuid,numeric,text,date,uuid,uuid,text,numeric,numeric,boolean,numeric) to authenticated;
grant select on public.interest_only_loan_status to authenticated;
