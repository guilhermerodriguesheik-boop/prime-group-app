-- Monthly interest-only lending: interest payments never reduce principal.
-- Principal amortization lowers future monthly interest; no compounding.
alter table public.loans
  add column if not exists interest_only boolean not null default false,
  add column if not exists first_interest_due_date date;

alter table public.loans
  add constraint loans_interest_only_monthly_check
  check (
    not interest_only or (
      interest_type = 'simple' and rate_period = 'month'
      and periodic_rate > 0 and first_interest_due_date is not null
      and first_interest_due_date > start_date
    )
  );

create or replace function public.create_interest_only_loan(
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
  p_final_maturity_date date default null
) returns uuid
language plpgsql security invoker set search_path=''
as $function$
declare
  v_due date;
  v_id uuid;
begin
  if p_monthly_rate is null or p_monthly_rate <= 0 or p_monthly_rate > 100 then
    raise exception 'Informe uma taxa de juros mensal positiva, em percentual (ex.: 30)';
  end if;
  if p_start_date is null then raise exception 'Informe a data inicial do empréstimo'; end if;
  v_due := coalesce(p_first_due_date, (p_start_date + interval '1 month')::date);
  if v_due <= p_start_date then raise exception 'Primeiro vencimento dos juros deve ser posterior ao início'; end if;
  v_id := public.create_finance_loan(
    p_workspace_id,p_borrower_name,p_principal,
    'simple',p_monthly_rate,'month',null,
    p_start_date,p_final_maturity_date,p_notes,p_action_id,
    p_record_disbursement,p_account_id
  );
  update public.loans set interest_only=true,first_interest_due_date=v_due,updated_at=now()
  where id=v_id and workspace_id=p_workspace_id;
  return v_id;
end;
$function$;

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
language plpgsql stable security invoker set search_path=''
as $function$
declare
  v_loan public.loans%rowtype;
  v_principal_paid numeric;
  v_interest_paid numeric;
  v_total_due numeric := 0;
  v_open_principal numeric;
  v_period_start date;
  v_due date;
  v_last date := null;
  v_next date := null;
  v_closed_on date;
  v_n integer;
begin
  select * into v_loan from public.loans where id=p_loan_id;
  if not found then raise exception 'Empréstimo não encontrado'; end if;
  if auth.uid() is null or not public.is_workspace_member(v_loan.workspace_id) then
    raise exception 'Sem permissão para consultar esse empréstimo';
  end if;
  if not v_loan.interest_only then raise exception 'Contrato não utiliza juros mensais fixos sobre capital'; end if;
  if p_as_of < v_loan.start_date then raise exception 'Consulta anterior ao empréstimo'; end if;

  select coalesce(sum(principal_amount),0),coalesce(sum(interest_amount),0)
    into v_principal_paid,v_interest_paid
    from public.loan_payments
    where loan_id=p_loan_id and (paid_at at time zone 'America/Sao_Paulo')::date <=p_as_of;
  principal_outstanding := greatest(0,v_loan.principal-v_principal_paid);
  monthly_interest := round(principal_outstanding*v_loan.periodic_rate/100,2);

  if v_loan.status='settled' then
    select max((paid_at at time zone 'America/Sao_Paulo')::date)
      into v_closed_on from public.loan_payments
      where loan_id=p_loan_id and principal_amount>0;
  end if;

  for v_n in 0..479 loop
    v_due := (v_loan.first_interest_due_date + make_interval(months=>v_n))::date;
    if v_due > p_as_of or (v_closed_on is not null and v_due > v_closed_on) then
      v_next := case when v_closed_on is not null then null else v_due end;
      exit;
    end if;
    v_period_start := case when v_n=0 then v_loan.start_date
      else (v_loan.first_interest_due_date + make_interval(months=>v_n-1))::date end;
    select greatest(0,v_loan.principal-coalesce(sum(principal_amount),0)) into v_open_principal
      from public.loan_payments
      where loan_id=p_loan_id and (paid_at at time zone 'America/Sao_Paulo')::date <= v_period_start;
    v_total_due := v_total_due + round(v_open_principal*v_loan.periodic_rate/100,2);
    v_last := v_due;
  end loop;

  if v_next is null and v_closed_on is null then
    v_next := (v_loan.first_interest_due_date + interval '480 months')::date;
  end if;
  accrued_interest_due := greatest(0,round(v_total_due-v_interest_paid,2));
  payoff_due := round(principal_outstanding+accrued_interest_due,2);
  next_interest_due_date := case when principal_outstanding <= 0 or v_closed_on is not null then null else v_next end;
  last_interest_due_date := v_last;
  return next;
end;
$function$;

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
declare
  v_loan public.loans%rowtype;
  v_state record;
  v_principal numeric := 0;
  v_interest numeric := 0;
  v_borrower text;
  v_transaction_id uuid;
  v_payment_id uuid;
  v_after record;
begin
  if p_amount is null or round(p_amount,2)<=0 or p_action_id is null or p_paid_on is null then
    raise exception 'Informe pagamento com valor e data válidos';
  end if;
  select * into v_loan from public.loans where id=p_loan_id for update;
  if not found then raise exception 'Empréstimo não encontrado'; end if;
  if auth.uid() is null or not public.can_edit_workspace(v_loan.workspace_id) then
    raise exception 'Sem permissão para registrar recebimentos';
  end if;
  if not v_loan.interest_only or v_loan.direction <> 'receivable' then
    raise exception 'Este contrato não usa juros mensais sem amortização';
  end if;
  select id into v_payment_id from public.loan_payments
    where external_action_id=p_action_id::text;
  if v_payment_id is not null then
    return jsonb_build_object('paymentId',v_payment_id,'reused',true);
  end if;
  if v_loan.status <> 'active' then raise exception 'Contrato não está ativo para recebimento'; end if;
  if p_paid_on < v_loan.start_date then raise exception 'Pagamento anterior ao início do contrato'; end if;
  if p_account_id is not null and not exists(
    select 1 from public.accounts where id=p_account_id and workspace_id=v_loan.workspace_id and active
  ) then raise exception 'Conta bancária não pertence ao ambiente Juros'; end if;

  select * into v_state from public.interest_only_loan_state(p_loan_id,p_paid_on);
  if p_mode='interest' then
    v_interest := round(p_amount,2);
  elsif p_mode='principal' then
    v_principal := round(p_amount,2);
  elsif p_mode='settlement' then
    v_principal := v_state.principal_outstanding;
    v_interest := v_state.accrued_interest_due;
    if round(p_amount,2) <> v_state.payoff_due then
      raise exception 'TOTAL_QUITACAO_DIVERGENTE: saldo calculado para a data é R$ %, sendo R$ % capital + R$ % juros vencidos',
        v_state.payoff_due,v_principal,v_interest;
    end if;
  elsif p_mode='split' then
    v_principal := p_principal_part;
    v_interest := p_interest_part;
    if v_principal is null or v_interest is null or
      round(v_principal+v_interest,2)<>round(p_amount,2) then
      raise exception 'Informe quanto do recebimento amortiza capital e quanto paga juros';
    end if;
  else
    raise exception 'Tipo de pagamento inválido (interest, principal, settlement, split)';
  end if;

  if v_principal < 0 or v_interest < 0 or
    round(v_principal+v_interest,2) <> round(p_amount,2) then
    raise exception 'Os valores de capital e juros não somam o recebimento';
  end if;
  if v_principal > v_state.principal_outstanding then
    raise exception 'Amortização maior que o saldo do capital';
  end if;
  if v_interest > v_state.accrued_interest_due then
    raise exception 'JUROS_AINDA_NAO_VENCIDOS: há R$ % de juros vencidos na data informada; próximo vencimento em %',
      v_state.accrued_interest_due,v_state.next_interest_due_date;
  end if;
  if not p_distinct_event and exists(
    select 1 from public.loan_payments where loan_id=p_loan_id
      and (paid_at at time zone 'America/Sao_Paulo')::date=p_paid_on
      and amount=round(p_amount,2) and principal_amount=v_principal and interest_amount=v_interest
  ) then
    raise exception 'POSSIBLE_DUPLICATE_PAYMENT: pagamento semelhante já registrado nesta data';
  end if;

  select name into v_borrower from public.counterparties where id=v_loan.counterparty_id;
  insert into public.transactions(
    workspace_id,account_id,counterparty_id,type,amount,occurred_at,
    description,status,source,external_id,metadata,created_by
  ) values(
    v_loan.workspace_id,p_account_id,v_loan.counterparty_id,'income',round(p_amount,2),
    (p_paid_on::text || ' 12:00:00-03')::timestamptz,
    'Empréstimo recebido: ' || coalesce(v_borrower,'Devedor'),
    'posted','loan','interest_only_payment:'||p_action_id::text,
    jsonb_build_object('loan_cashflow','repayment','loan_id',p_loan_id,
      'loan_principal',v_principal,'loan_interest',v_interest,'loan_fees',0),
    auth.uid()
  ) returning id into v_transaction_id;
  insert into public.loan_payments(
    loan_id,paid_at,amount,principal_amount,interest_amount,fees_amount,
    notes,transaction_id,external_action_id
  ) values (
    p_loan_id,(p_paid_on::text || ' 12:00:00-03')::timestamptz,
    round(p_amount,2),v_principal,v_interest,0,
    p_notes,v_transaction_id,p_action_id::text
  ) returning id into v_payment_id;

  select * into v_after from public.interest_only_loan_state(p_loan_id,p_paid_on);
  if v_after.principal_outstanding=0 and v_after.accrued_interest_due=0 then
    update public.loans set status='settled',updated_at=now() where id=p_loan_id;
  end if;
  return jsonb_build_object('paymentId',v_payment_id,'loanId',p_loan_id,
    'principalPaid',v_principal,'interestPaid',v_interest,
    'principalRemaining',v_after.principal_outstanding,
    'interestOverdue',v_after.accrued_interest_due,
    'monthlyInterestNext',v_after.monthly_interest,
    'loanSettled',v_after.principal_outstanding=0 and v_after.accrued_interest_due=0);
end;
$function$;

create or replace view public.interest_only_loan_status with (security_invoker=true) as
select
  l.id as loan_id, l.workspace_id,
  s.principal_outstanding,s.monthly_interest,s.accrued_interest_due,s.payoff_due,
  s.next_interest_due_date,s.last_interest_due_date
from public.loans l
cross join lateral public.interest_only_loan_state(l.id,(timezone('America/Sao_Paulo',now()))::date) s
where l.interest_only and l.status in ('active','settled');

-- Disallow bypassing interest-only accounting via the generic loan-payment RPC.
-- Reuse the previous generic function implementation unchanged except for guard.
create or replace function public.register_finance_loan_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_principal_amount numeric,
  p_interest_amount numeric,
  p_fees_amount numeric,
  p_paid_on date,
  p_action_id uuid,
  p_account_id uuid default null,
  p_notes text default null,
  p_distinct_event boolean default false
) returns uuid
language plpgsql security invoker set search_path='public'
as $function$
declare
  v_loan public.loans%rowtype;
  v_borrower text;
  v_paid_principal numeric;
  v_payment_id uuid;
  v_tx_id uuid;
begin
  if p_action_id is null or p_paid_on is null or p_amount is null
    or p_amount <= 0 or p_principal_amount is null or p_interest_amount is null
    or p_fees_amount is null or least(p_principal_amount,p_interest_amount,p_fees_amount)<0
    or round(p_principal_amount+p_interest_amount+p_fees_amount,2)<>round(p_amount,2) then
    raise exception 'Informe a composição exata do recebimento: capital + juros + taxas = total';
  end if;
  select * into v_loan from public.loans where id=p_loan_id for update;
  if not found then raise exception 'Empréstimo não encontrado'; end if;
  if auth.uid() is null or not public.can_edit_workspace(v_loan.workspace_id) then
    raise exception 'Sem permissão';
  end if;
  if v_loan.interest_only then
    raise exception 'Contrato de juros mensais exige a função register_interest_only_payment';
  end if;
  if v_loan.direction <> 'receivable' or v_loan.status not in ('active','settled') then
    raise exception 'Empréstimo não está ativo para receber pagamentos';
  end if;
  if p_account_id is not null and not exists (
    select 1 from public.accounts where id=p_account_id and workspace_id=v_loan.workspace_id and active
  ) then raise exception 'Conta bancária não pertence ao ambiente Juros'; end if;
  select id into v_payment_id from public.loan_payments
    where external_action_id=p_action_id::text limit 1;
  if v_payment_id is not null then return v_payment_id; end if;
  select coalesce(sum(principal_amount),0) into v_paid_principal
    from public.loan_payments where loan_id=p_loan_id;
  if round(p_principal_amount,2) > round(v_loan.principal-v_paid_principal,2) then
    raise exception 'Amortização maior que o capital devedor';
  end if;
  if not p_distinct_event and exists (
    select 1 from public.loan_payments where loan_id=p_loan_id
      and (paid_at at time zone 'America/Sao_Paulo')::date=p_paid_on
      and amount=round(p_amount,2)
      and principal_amount=round(p_principal_amount,2)
      and interest_amount=round(p_interest_amount,2)
      and fees_amount=round(p_fees_amount,2)
  ) then raise exception 'POSSIBLE_DUPLICATE_PAYMENT: recebimento igual já registrado nesta data'; end if;
  select name into v_borrower from public.counterparties where id=v_loan.counterparty_id;
  insert into public.transactions(
    workspace_id,account_id,counterparty_id,type,amount,occurred_at,description,
    status,source,external_id,metadata,created_by
  ) values(
    v_loan.workspace_id,p_account_id,v_loan.counterparty_id,'income',round(p_amount,2),
    (p_paid_on::text || ' 12:00:00-03')::timestamptz,
    'Recebimento de empréstimo: ' || coalesce(v_borrower,'Devedor'),
    'posted','loan','loan_payment:' || p_action_id::text,
    jsonb_build_object('loan_cashflow','repayment','loan_id',p_loan_id,
      'loan_principal',round(p_principal_amount,2),'loan_interest',round(p_interest_amount,2),
      'loan_fees',round(p_fees_amount,2)),auth.uid()
  ) returning id into v_tx_id;
  insert into public.loan_payments(
    loan_id,paid_at,amount,principal_amount,interest_amount,fees_amount,
    notes,transaction_id,external_action_id
  ) values(
    p_loan_id,(p_paid_on::text || ' 12:00:00-03')::timestamptz,
    round(p_amount,2),round(p_principal_amount,2),round(p_interest_amount,2),
    round(p_fees_amount,2),p_notes,v_tx_id,p_action_id::text
  ) returning id into v_payment_id;
  if round(v_loan.principal-v_paid_principal-p_principal_amount,2)<=0 then
    update public.loans set status='settled',updated_at=now() where id=p_loan_id;
  end if;
  return v_payment_id;
end;
$function$;

revoke all on function public.create_interest_only_loan(uuid,text,numeric,numeric,date,date,uuid,boolean,uuid,text,date) from public,anon;
revoke all on function public.interest_only_loan_state(uuid,date) from public,anon;
revoke all on function public.register_interest_only_payment(uuid,numeric,text,date,uuid,uuid,text,numeric,numeric,boolean) from public,anon;
grant execute on function public.create_interest_only_loan(uuid,text,numeric,numeric,date,date,uuid,boolean,uuid,text,date) to authenticated;
grant execute on function public.interest_only_loan_state(uuid,date) to authenticated;
grant execute on function public.register_interest_only_payment(uuid,numeric,text,date,uuid,uuid,text,numeric,numeric,boolean) to authenticated;
grant select on public.interest_only_loan_status to authenticated;
