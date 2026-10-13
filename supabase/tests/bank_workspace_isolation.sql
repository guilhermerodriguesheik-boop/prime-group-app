-- Run as an administrative test connection. All fixtures are rolled back.
begin;
select set_config('request.jwt.claim.sub', (
  select owner_id::text from public.workspaces
  group by owner_id having count(distinct kind) >= 2 limit 1
), true);
set local role authenticated;
do $$
declare
  w1 uuid; w2 uuid; c uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
begin
  select id into w1 from public.workspaces where owner_id=auth.uid() order by id limit 1;
  select id into w2 from public.workspaces where owner_id=auth.uid() and id<>w1 order by id limit 1;
  if w1 is null or w2 is null then raise exception 'Need an owner with two workspaces'; end if;
  insert into public.bank_connections(id,owner_id,workspace_id,provider,provider_item_id,display_name,account_kind)
  values(c,auth.uid(),w1,'manual','rls-test-'||c,'RLS test','personal');
  insert into public.bank_accounts(id,owner_id,workspace_id,connection_id,provider_account_id,display_name)
  values(a,auth.uid(),w1,c,'rls-test','RLS test');
  begin
    insert into public.bank_accounts(owner_id,workspace_id,connection_id,provider_account_id,display_name)
    values(auth.uid(),w2,c,'wrong-workspace','RLS test');
    raise exception 'FAIL: cross-workspace account accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.bank_accounts set workspace_id=w2 where id=a;
    raise exception 'FAIL: cross-workspace account update accepted';
  exception when insufficient_privilege then null;
  end;
  insert into public.bank_transactions(owner_id,workspace_id,bank_account_id,provider_transaction_id,occurred_on,description,amount,direction,provider_status)
  values(auth.uid(),w1,a,'valid',current_date,'RLS test',1,'credit','POSTED');
  begin
    insert into public.bank_transactions(owner_id,workspace_id,bank_account_id,provider_transaction_id,occurred_on,description,amount,direction,provider_status)
    values(auth.uid(),w2,a,'invalid',current_date,'RLS test',1,'credit','POSTED');
    raise exception 'FAIL: cross-workspace transaction accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if exists(select 1 from public.bank_accounts where id=a) or exists(select 1 from public.bank_connections where id=c) then
    raise exception 'FAIL: another user can read fixtures';
  end if;
end $$;
rollback;
