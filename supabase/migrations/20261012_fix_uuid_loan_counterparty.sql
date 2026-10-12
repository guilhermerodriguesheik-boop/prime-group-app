-- PostgreSQL does not support min(uuid); select a UUID through array_agg instead.
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

  select count(*), (array_agg(id))[1] into v_matches, v_counterparty_id
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
