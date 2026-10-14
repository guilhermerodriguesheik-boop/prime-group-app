-- Normalize opted-in Brazilian recipient numbers to E.164 before WhatsApp dispatch.
create or replace function public.prime_claim_outbox(p_secret text,p_limit int default 12)
returns jsonb language plpgsql security definer set search_path=public as $$
declare response jsonb;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized'; end if;
 with eligible as(
  select o.id from public.prime_outbox o
   join public.whatsapp_pairings p on p.user_id=o.user_id and p.enabled and p.connected_at is not null
   left join public.counterparties c on c.id=o.contact_id
   left join public.workspaces w on w.id=c.workspace_id
   where o.attempts<4 and
     (o.status in('pending','retry') or(o.status='processing' and o.processing_started_at<now()-interval '20 minutes'))
     and (o.category<>'bank' or coalesce((select s.bank_alerts from public.prime_notification_settings s where s.user_id=o.user_id),false))
     and (
       (o.category='collection' and c.whatsapp_consent and c.whatsapp_authorized_at is not null
         and w.owner_id=o.user_id and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')~'^[0-9]{10,15}$')
       or (o.category<>'collection' and p.phone_number ~ '^[0-9]{10,15}$')
     )
   order by o.created_at for update of o skip locked
   limit least(greatest(coalesce(p_limit,12),1),30)
 ), claimed as(
  update public.prime_outbox o set status='processing',attempts=o.attempts+1,processing_started_at=now(),last_error=null
  where o.id in(select id from eligible) returning o.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'phone',
   case when c.category='collection' then case when length(regexp_replace(cp.phone,'[^0-9]','','g')) in (10,11)
      then '55'||regexp_replace(cp.phone,'[^0-9]','','g')
      else regexp_replace(cp.phone,'[^0-9]','','g') end
     else p.phone_number end,
   'message',c.message)), '[]'::jsonb)
 into response from claimed c join public.whatsapp_pairings p on p.user_id=c.user_id
 left join public.counterparties cp on cp.id=c.contact_id;
 return response;
end $$;
