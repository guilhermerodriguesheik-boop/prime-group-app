-- Loan receipts and disbursements are cash flows, not P&L revenue/expenses.
-- DB functions provide atomic, authorized, idempotent writes.
alter table public.loans
  add column if not exists external_action_id text unique,
  add column if not exists disbursement_transaction_id uuid references public.transactions(id) on delete set null;
alter table public.loan_payments
  add column if not exists external_action_id text unique;

create index if not exists loans_workspace_counterparty_idx
  on public.loans(workspace_id, counterparty_id, start_date);
create index if not exists loan_payments_loan_paid_idx
  on public.loan_payments(loan_id, paid_at);

create or replace function public.create_finance_loan(
  p_workspace_id uuid,
  p_borrower_name text,
  p_principal numeric,
  p_interest_type text,
  p_periodic_rate numeric,
  p_rate_period text,
  p_fixed_interest numeric,
  p_start_date date,
  p_maturity_date date,
  p_notes text,
  p_action_id uuid,
  p_record_disbursement boolean default true,
  p_account_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_kind text;
  v_counterparty_id uuid;
  v_matches integer;
  v_loan_id uuid;
  v_tx_id uuid;
  v_old_id uuid;
begin
  if auth.uid() is null or not public.can_edit_workspace(p_workspace_id) then
    raise exception 'Acesso negado ao ambiente de empréstimos';
  end if;
  select kind into v_kind from public.workspaces where id = p_workspace_id;
  if v_kind is distinct from 'interest' then
    raise exception 'Empréstimos só podem ser cadastrados no ambiente Juros';
  end if;
  if p_action_id is null or p_borrower_name is null or length(btrim(p_borrower_name)) < 2
    or p_principal is null or p_principal <= 0 or p_start_date is null then
    raise exception 'Informe nome, valor positivo e data do empréstimo';
  end if;
  if p_maturity_date is not null and p_maturity_date < p_start_date then
    raise exception 'Vencimento anterior ao início do empréstimo';
  end if;
  if p_interest_type not in ('simple','compound','fixed','manual') then
    raise exception 'Tipo de juros inválido';
  end if;
  if p_interest_type in ('simple','compound') and
    (p_periodic_rate is null or p_periodic_rate < 0 or p_rate_period not in ('day','week','month','year')) then
    raise exception 'Taxa e período são necessários para juros simples ou compostos';
  end if;
  if p_interest_type = 'fixed' and (p_fixed_interest is null or p_fixed_interest < 0) then
    raise exception 'Informe juros fixos';
  end if;
  if p_periodic_rate is not null and (p_periodic_rate < 0 or p_periodic_rate > 100) then
    raise exception 'Taxa fora do limite de validação de 0 a 100 por período';
  end if;
  if p_account_id is not null and not exists(
    select 1 from public.accounts where id = p_account_id and workspace_id = p_workspace_id and active
  ) then
    raise exception 'Conta bancária não pertence ao ambiente Juros';
  end if;
  select id into v_old_id from public.loans
    where external_action_id = p_action_id::text limit 1;
  if v_old_id is not null then return v_old_id; end if;

  select count(*), min(id) into v_matches, v_counterparty_id
  from public.counterparties
  where workspace_id = p_workspace_id and lower(btrim(name)) = lower(btrim(p_borrower_name));
  if v_matches > 1 then raise exception 'Pessoa ambígua; selecione o devedor'; end if;
  if v_counterparty_id is null then
    insert into public.counterparties(workspace_id,name,kind)
      values(p_workspace_id,btrim(p_borrower_name),'borrower')
      returning id into v_counterparty_id;
  end if;

  if exists(
    select 1 from public.loans where workspace_id = p_workspace_id and counterparty_id = v_counterparty_id
      and start_date = p_start_date and principal = p_principal
      and status in ('draft','active','settled')
  ) then
    raise exception 'POSSIBLE_DUPLICATE_LOAN: Empréstimo semelhante já cadastrado para esta pessoa, valor e data';
  end if;

  insert into public.loans(
    workspace_id,counterparty_id,direction,principal,periodic_rate,rate_period,interest_type,
    fixed_interest,start_date,maturity_date,installment_frequency,status,notes,external_action_id
  ) values(
    p_workspace_id,v_counterparty_id,'receivable',round(p_principal,2),p_periodic_rate,
    case when p_interest_type in ('simple','compound') then p_rate_period else null end,
    p_interest_type,case when p_interest_type='fixed' then p_fixed_interest else null end,
    p_start_date,p_maturity_date,'monthly',
    case when p_record_disbursement then 'active' else 'draft' end,
    p_notes,p_action_id::text
  ) returning id into v_loan_id;

  if p_record_disbursement then
    insert into public.transactions(
      workspace_id,account_id,counterparty_id,type,amount,occurred_at,description,
      status,source,external_id,metadata,created_by
    ) values (
      p_workspace_id,p_account_id,v_counterparty_id,'expense',round(p_principal,2),
      (p_start_date::text || ' 12:00:00-03')::timestamptz,
      'Capital emprestado: ' || btrim(p_borrower_name),
      'posted','loan','loan_disbursement:' || p_action_id::text,
      jsonb_build_object('loan_cashflow','principal_out','loan_id',v_loan_id),auth.uid()
    ) returning id into v_tx_id;
    update public.loans set disbursement_transaction_id=v_tx_id where id=v_loan_id;
  end if;
  return v_loan_id;
end;
$function$;

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
language plpgsql
security invoker
set search_path = ''
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
    raise exception 'Sem permissão para este empréstimo';
  end if;
  if v_loan.direction <> 'receivable' or v_loan.status not in ('active','settled') then
    raise exception 'Empréstimo não está ativo para receber pagamentos';
  end if;
  if p_account_id is not null and not exists (
    select 1 from public.accounts where id=p_account_id
      and workspace_id=v_loan.workspace_id and active
  ) then
    raise exception 'Conta bancária não pertence ao ambiente Juros';
  end if;

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
  ) then
    raise exception 'POSSIBLE_DUPLICATE_PAYMENT: recebimento igual já registrado nesta data';
  end if;

  select name into v_borrower from public.counterparties where id=v_loan.counterparty_id;
  insert into public.transactions(
    workspace_id,account_id,counterparty_id,type,amount,occurred_at,description,
    status,source,external_id,metadata,created_by
  ) values(
    v_loan.workspace_id,p_account_id,v_loan.counterparty_id,'income',round(p_amount,2),
    (p_paid_on::text || ' 12:00:00-03')::timestamptz,
    'Recebimento de empréstimo: ' || coalesce(v_borrower,'Devedor'),
    'posted','loan','loan_payment:' || p_action_id::text,
    jsonb_build_object(
      'loan_cashflow','repayment','loan_id',p_loan_id,
      'loan_principal',round(p_principal_amount,2),
      'loan_interest',round(p_interest_amount,2),
      'loan_fees',round(p_fees_amount,2)
    ),
    auth.uid()
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

revoke all on function public.create_finance_loan(uuid,text,numeric,text,numeric,text,numeric,date,date,text,uuid,boolean,uuid) from public, anon;
revoke all on function public.register_finance_loan_payment(uuid,numeric,numeric,numeric,numeric,date,uuid,uuid,text,boolean) from public, anon;
grant execute on function public.create_finance_loan(uuid,text,numeric,text,numeric,text,numeric,date,date,text,uuid,boolean,uuid) to authenticated;
grant execute on function public.register_finance_loan_payment(uuid,numeric,numeric,numeric,numeric,date,uuid,uuid,text,boolean) to authenticated;
