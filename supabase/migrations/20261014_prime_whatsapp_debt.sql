create or replace function public.prime_whatsapp_create_debt(
 p_secret text,p_event_id uuid,p_index integer,p_description text,p_amount numeric,
 p_due_date date,p_workspace text,p_recurrence text default 'none'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid;w uuid;event_key text; existing uuid; created_id uuid;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 if p_index not between 0 and 5 or p_amount<=0 or p_amount>100000000
   or length(btrim(coalesce(p_description,'')))<2 or length(p_description)>180
   or p_workspace not in ('prime','personal') or p_recurrence not in ('none','monthly')
   or p_due_date is null then raise exception 'invalid debt';end if;
 select wp.user_id into u from public.whatsapp_events e join public.whatsapp_pairings wp
  on wp.phone_number=regexp_replace(coalesce(e.from_number,''),'[^0-9]','','g')
   and wp.enabled and wp.connected_at is not null
 where e.id=p_event_id and e.status='processing';
 if u is null then raise exception 'unverified sender';end if;
 select id into w from public.workspaces where owner_id=u and kind=p_workspace;
 if w is null then raise exception 'workspace missing';end if;
 event_key:='debt:'||p_event_id||':'||p_index;
 select record_id into existing from public.whatsapp_action_receipts where external_id=event_key;
 if existing is not null then return jsonb_build_object('saved',true,'reused',true);end if;
 if p_recurrence='monthly' then
  insert into public.prime_recurring_bills(workspace_id,description,amount,due_day,starts_on)
  values(w,left(p_description,180),p_amount,extract(day from p_due_date),p_due_date)
  returning id into created_id;
 else
  insert into public.payables(workspace_id,description,amount,due_date,status)
  values(w,left(p_description,180),p_amount,p_due_date,'open') returning id into created_id;
 end if;
 insert into public.whatsapp_action_receipts(external_id,event_id,kind,record_id)
 values(event_key,p_event_id,'note',created_id);
 return jsonb_build_object('saved',true,'kind','debt','id',created_id,'recurrence',p_recurrence);
end $$;
revoke all on function public.prime_whatsapp_create_debt(text,uuid,int,text,numeric,date,text,text) from public;
grant execute on function public.prime_whatsapp_create_debt(text,uuid,int,text,numeric,date,text,text) to anon,authenticated;
notify pgrst,'reload schema';
