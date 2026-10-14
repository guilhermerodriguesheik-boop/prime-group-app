-- Isolamento adicional nas referencias fiscais para impedir associar registros de outro workspace.
create or replace function public.prime_fiscal_enforce_workspace()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.nfe_id is not null and not exists (
    select 1 from public.fiscal_nfe_inbox n where n.id=new.nfe_id and n.workspace_id=new.workspace_id
  ) then
    raise exception 'NF-e pertence a outro ambiente ou nao existe';
  end if;
  if new.trip_id is not null and not exists (
    select 1 from public.trips t where t.id=new.trip_id and t.workspace_id=new.workspace_id
  ) then
    raise exception 'Viagem pertence a outro ambiente ou nao existe';
  end if;
  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id=new.vehicle_id and v.workspace_id=new.workspace_id
  ) then
    raise exception 'Veiculo pertence a outro ambiente ou nao existe';
  end if;
  if new.driver_id is not null and not exists (
    select 1 from public.drivers d where d.id=new.driver_id and d.workspace_id=new.workspace_id
  ) then
    raise exception 'Motorista pertence a outro ambiente ou nao existe';
  end if;
  return new;
end;
$$;

create trigger fiscal_workspace_guard_before_save
before insert or update on public.fiscal_drafts
for each row execute function public.prime_fiscal_enforce_workspace();

create unique index if not exists unique_fiscal_open_cte_draft
on public.fiscal_drafts(workspace_id,nfe_id,ciot,freight_value)
where document_type='cte' and status='draft' and nfe_id is not null and ciot is not null and freight_value is not null;
