-- Pedidos da nova operacao de entregas por volume; independente da Ortobom.
create table if not exists public.prime_delivery_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  account_name text not null check (char_length(account_name) between 2 and 100),
  romaneio text not null check (romaneio ~ '^[0-9]{3,14}$'),
  document_number text not null default '',
  document_kind text not null check (document_kind in ('NF','Pedido')),
  carrier text not null default '',
  recipient text not null check (char_length(recipient) between 2 and 200),
  neighborhood text not null default '',
  source_stage text not null check (source_stage in ('faturado_no_piso','aguardando_faturamento')),
  declared_volumes integer check (declared_volumes between 1 and 50000),
  collected_volumes integer check (collected_volumes between 1 and 50000),
  delivered_volumes integer check (delivered_volumes between 1 and 50000),
  delivery_status text not null default 'a_conferir'
    check (delivery_status in ('a_conferir','aguardando_coleta','coletado','em_rota','entregue','ocorrencia','devolvido','cancelado')),
  report_received_on date,
  arrived_on date,
  collected_on date,
  departed_on date,
  delivered_on date,
  accounted_on date,
  invoiced_on date,
  unit_rate numeric(12,2) check (unit_rate >= 0 and unit_rate <= 100000),
  driver_name text not null default '',
  proof_reference text not null default '',
  notes text not null default '',
  source_filename text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,account_name,romaneio)
);
create index if not exists prime_delivery_orders_account_billing_idx
  on public.prime_delivery_orders(workspace_id,account_name,accounted_on)
  where invoiced_on is null;
create index if not exists prime_delivery_orders_status_idx
  on public.prime_delivery_orders(workspace_id,delivery_status);

alter table public.prime_delivery_orders enable row level security;
revoke all on public.prime_delivery_orders from public, anon;
grant select,insert,update on public.prime_delivery_orders to authenticated;

create policy prime_delivery_owner_select on public.prime_delivery_orders
  for select to authenticated
  using (exists(select 1 from public.workspaces w
    where w.id=workspace_id and w.kind='prime' and w.owner_id=(select auth.uid())));
create policy prime_delivery_owner_insert on public.prime_delivery_orders
  for insert to authenticated
  with check (created_by=(select auth.uid()) and exists(select 1 from public.workspaces w
    where w.id=workspace_id and w.kind='prime' and w.owner_id=(select auth.uid())));
create policy prime_delivery_owner_update on public.prime_delivery_orders
  for update to authenticated
  using (created_by=(select auth.uid()) and exists(select 1 from public.workspaces w
    where w.id=workspace_id and w.kind='prime' and w.owner_id=(select auth.uid())))
  with check (created_by=(select auth.uid()) and exists(select 1 from public.workspaces w
    where w.id=workspace_id and w.kind='prime' and w.owner_id=(select auth.uid())));

create function public.prime_delivery_order_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and old.invoiced_on is not null then
    raise exception 'Pedido faturado esta bloqueado. Faca ajuste documentado em outro lancamento.';
  end if;
  if new.accounted_on is not null or new.invoiced_on is not null then
    if new.delivery_status <> 'entregue' or new.delivered_on is null
       or new.declared_volumes is null or new.collected_volumes is null
       or new.delivered_volumes is null
       or new.declared_volumes <> new.collected_volumes
       or new.collected_volumes <> new.delivered_volumes then
      raise exception 'Prestacao de contas exige entrega e volumes conferidos em todas as etapas.';
    end if;
  end if;
  if new.invoiced_on is not null and (new.accounted_on is null or coalesce(new.unit_rate,0)<=0) then
    raise exception 'Faturamento exige prestacao de contas e tarifa por volume.';
  end if;
  new.updated_at=now();
  return new;
end;
$$;
create trigger prime_delivery_order_guard_trg
  before insert or update on public.prime_delivery_orders
  for each row execute function public.prime_delivery_order_guard();

-- Fechamento semanal em uma unica transacao, com bloqueio contra cobranca duplicada.
create function public.prime_close_delivery_week(
  p_account_name text,p_start date,p_end date,p_ids uuid[],p_invoiced_on date
) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_expected integer;
  v_valid integer;
  v_written integer;
begin
  if (select auth.uid()) is null then raise exception 'Nao autenticado.'; end if;
  v_expected:=coalesce(cardinality(p_ids),0);
  if v_expected<1 or v_expected>500 or p_start is null or p_end is null
      or p_end<>p_start+6 or p_invoiced_on is null then
    raise exception 'Fechamento semanal invalido.';
  end if;
  select count(*) into v_valid
  from public.prime_delivery_orders o
  join public.workspaces w on w.id=o.workspace_id
  where o.id=any(p_ids)
    and w.owner_id=(select auth.uid()) and w.kind='prime'
    and o.account_name=p_account_name
    and o.invoiced_on is null and o.accounted_on between p_start and p_end
    and o.delivery_status='entregue' and o.delivered_on is not null
    and o.declared_volumes=o.collected_volumes
    and o.collected_volumes=o.delivered_volumes
    and o.declared_volumes is not null and o.unit_rate>0;
  if v_valid<>v_expected then
    raise exception 'Pedidos divergentes, duplicados, ja faturados ou fora da semana.';
  end if;
  update public.prime_delivery_orders set invoiced_on=p_invoiced_on
   where id=any(p_ids) and account_name=p_account_name
     and invoiced_on is null and accounted_on between p_start and p_end;
  get diagnostics v_written=row_count;
  if v_written<>v_expected then raise exception 'Fechamento alterado por outra operacao; tente novamente.'; end if;
  return v_written;
end;
$$;
revoke all on function public.prime_close_delivery_week(text,date,date,uuid[],date) from public,anon;
grant execute on function public.prime_close_delivery_week(text,date,date,uuid[],date) to authenticated;
