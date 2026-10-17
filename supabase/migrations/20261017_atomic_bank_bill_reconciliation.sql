-- Conciliação atômica entre extratos bancários e obrigações com autorização do proprietário.
create table if not exists public.prime_bank_bill_matches (
 bank_transaction_id uuid primary key references public.bank_transactions(id) on delete restrict,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 bill_kind text not null check (bill_kind in ('payable','receivable')),
 bill_id uuid not null,
 amount numeric(12,2) not null check (amount > 0),
 created_at timestamptz not null default now()
);
create index if not exists prime_bank_bill_matches_target on public.prime_bank_bill_matches
 (workspace_id,bill_kind,bill_id);
alter table public.prime_bank_bill_matches enable row level security;
create policy "prime_bank_bill_matches_owner_select" on public.prime_bank_bill_matches
 for select to authenticated using (owner_id=(select auth.uid()) and
 exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy "prime_bank_bill_matches_owner_insert" on public.prime_bank_bill_matches
 for insert to authenticated with check (owner_id=(select auth.uid()) and
 exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy "prime_bank_bill_matches_owner_delete" on public.prime_bank_bill_matches
 for delete to authenticated using (owner_id=(select auth.uid()) and
 exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
grant select,insert,delete on public.prime_bank_bill_matches to authenticated;

CREATE OR REPLACE FUNCTION public.prime_bank_bill_match_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 who uuid:=auth.uid();
 rec record; obligation record; due_amount numeric; effective numeric;
begin
 if who is null then raise exception 'Sessão não autenticada'; end if;
 if TG_OP='INSERT' then
  if NEW.owner_id<>who then raise exception 'Proprietário inválido'; end if;
  if NEW.bill_kind not in ('payable','receivable') then raise exception 'Tipo inválido'; end if;
  select b.id,b.owner_id,b.workspace_id,b.amount,b.direction,b.provider_status,
   b.review_status,b.linked_transaction_id into rec
   from public.bank_transactions b join public.bank_accounts a on a.id=b.bank_account_id
   where b.id=NEW.bank_transaction_id and b.owner_id=who
     and a.owner_id=who and a.workspace_id=b.workspace_id
     and a.kind='BANK' and a.currency='BRL'
   for update of b;
  if not found then raise exception 'Extrato não autorizado'; end if;
  if rec.workspace_id<>NEW.workspace_id or rec.amount<>NEW.amount or rec.amount<=0
    or rec.provider_status<>'POSTED' or rec.review_status<>'pending'
    or rec.linked_transaction_id is not null then
    raise exception 'Movimentação não disponível para baixa'; end if;
  if (NEW.bill_kind='payable' and rec.direction<>'debit')
    or (NEW.bill_kind='receivable' and rec.direction<>'credit') then
    raise exception 'Movimento não corresponde à conta'; end if;
  if not exists(select 1 from public.workspaces w where w.id=NEW.workspace_id
       and w.owner_id=who and w.kind in ('prime','personal')) then
    raise exception 'Ambiente financeiro não autorizado'; end if;
  if NEW.bill_kind='payable' then
    select p.amount,p.paid_amount as settled,p.status,p.due_date into obligation
    from public.payables p where p.id=NEW.bill_id and p.workspace_id=NEW.workspace_id
      and p.status not in ('cancelled','paid') for update;
  else
    select p.amount,p.received_amount as settled,p.status,p.due_date into obligation
    from public.receivables p where p.id=NEW.bill_id and p.workspace_id=NEW.workspace_id
      and p.status not in ('cancelled','received') for update;
  end if;
  if not found then raise exception 'Conta não encontrada no mesmo ambiente'; end if;
  due_amount:=round(obligation.amount-obligation.settled,2);
  if rec.amount>due_amount or due_amount<=0 then
    raise exception 'O valor do extrato excede o saldo devido'; end if;
  if NEW.bill_kind='payable' then
   update public.payables set paid_amount=round(obligation.settled+rec.amount,2),
    status=case when rec.amount=due_amount then 'paid' else 'partial' end,updated_at=now()
   where id=NEW.bill_id and workspace_id=NEW.workspace_id;
  else
   update public.receivables set received_amount=round(obligation.settled+rec.amount,2),
    status=case when rec.amount=due_amount then 'received' else 'partial' end,updated_at=now()
   where id=NEW.bill_id and workspace_id=NEW.workspace_id;
  end if;
  update public.bank_transactions set review_status='matched',updated_at=now()
   where id=NEW.bank_transaction_id and owner_id=who;
  NEW.created_at:=now();
  return NEW;
 end if;
 if TG_OP='DELETE' then
  if OLD.owner_id<>who then raise exception 'Proprietário inválido'; end if;
  select b.id,b.owner_id,b.workspace_id,b.review_status into rec
  from public.bank_transactions b where b.id=OLD.bank_transaction_id and b.owner_id=who
  for update;
  if not found or rec.workspace_id<>OLD.workspace_id or rec.review_status<>'matched'
   then raise exception 'Movimentação não disponível para estorno'; end if;
  if OLD.bill_kind='payable' then
   select p.amount,p.paid_amount as settled,p.status,p.due_date into obligation
   from public.payables p where p.id=OLD.bill_id and p.workspace_id=OLD.workspace_id
   for update;
  else
   select p.amount,p.received_amount as settled,p.status,p.due_date into obligation
   from public.receivables p where p.id=OLD.bill_id and p.workspace_id=OLD.workspace_id
   for update;
  end if;
  if not found or obligation.settled<OLD.amount or obligation.status='cancelled'
   then raise exception 'Revisar quitação manual antes de desfazer a conciliação'; end if;
  effective:=round(obligation.settled-OLD.amount,2);
  if OLD.bill_kind='payable' then
   update public.payables set paid_amount=effective,
    status=case when effective>=obligation.amount then 'paid'
     when effective>0 then 'partial' when obligation.due_date<current_date then 'overdue'
     else 'open' end,updated_at=now()
   where id=OLD.bill_id and workspace_id=OLD.workspace_id;
  else
   update public.receivables set received_amount=effective,
    status=case when effective>=obligation.amount then 'received'
     when effective>0 then 'partial' when obligation.due_date<current_date then 'overdue'
     else 'open' end,updated_at=now()
   where id=OLD.bill_id and workspace_id=OLD.workspace_id;
  end if;
  update public.bank_transactions set review_status='pending',updated_at=now()
   where id=OLD.bank_transaction_id and owner_id=who;
  return OLD;
 end if;
 return null;
end $function$

revoke all on function public.prime_bank_bill_match_guard() from public,anon;
create trigger prime_bank_bill_match_safeguard before insert or delete on public.prime_bank_bill_matches
 for each row execute function public.prime_bank_bill_match_guard();
drop policy if exists "Prime owner inserts cargo operations" on public.prime_cargo_operations;
drop policy if exists "Prime owner edits cargo operations" on public.prime_cargo_operations;
create policy "Prime owner inserts cargo operations" on public.prime_cargo_operations
 for insert to authenticated with check (
 exists(select 1 from public.workspaces w where w.id=prime_cargo_operations.workspace_id and
 w.owner_id=(select auth.uid()) and w.kind='prime')
 and (driver_id is null or exists(select 1 from public.drivers d
 where d.id=prime_cargo_operations.driver_id and d.workspace_id=prime_cargo_operations.workspace_id)));
create policy "Prime owner edits cargo operations" on public.prime_cargo_operations
 for update to authenticated using (
 exists(select 1 from public.workspaces w where w.id=prime_cargo_operations.workspace_id and
 w.owner_id=(select auth.uid()) and w.kind='prime')) with check (
 exists(select 1 from public.workspaces w where w.id=prime_cargo_operations.workspace_id and
 w.owner_id=(select auth.uid()) and w.kind='prime')
 and (driver_id is null or exists(select 1 from public.drivers d
 where d.id=prime_cargo_operations.driver_id and d.workspace_id=prime_cargo_operations.workspace_id)));
