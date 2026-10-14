-- Only contacts marked as having authorized WhatsApp communications are eligible.
alter table public.prime_outbox add column if not exists contact_id uuid references public.counterparties(id) on delete set null;
alter table public.prime_outbox drop constraint if exists prime_outbox_category_check;
alter table public.prime_outbox add constraint prime_outbox_category_check
 check(category in ('bank','report','own-reminder','collection'));
create index if not exists prime_outbox_contact_idx on public.prime_outbox(contact_id) where contact_id is not null;

create or replace function public.prime_queue_contact_collections(p_secret text)
returns integer language plpgsql security definer set search_path=public as $$
declare due_today date:=(now() at time zone 'America/Sao_Paulo')::date;created_count int;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 with created as (
  insert into public.prime_outbox(user_id,dedupe_key,category,contact_id,message)
  select w.owner_id,'collection:'||r.id||':'||due_today,'collection',c.id,
    'Olá, '||left(c.name,60)||'. Lembrete de vencimento: '||left(r.description,100)||
    ' · R$ '||to_char(greatest(r.amount-r.received_amount,0),'FM999G999G990D00')||
    ' · vence em '||to_char(due_today,'DD/MM/YYYY')||
    '. Se já pagou ou precisa corrigir, responda ao responsável da Prime. Mensagem administrativa de lembrete.'
  from public.receivables r join public.workspaces w on w.id=r.workspace_id
   join public.counterparties c on c.id=r.counterparty_id and c.workspace_id=w.id
   join public.whatsapp_pairings wp on wp.user_id=w.owner_id and wp.enabled and wp.connected_at is not null
  where r.status in('open','partial','overdue') and r.due_date=due_today and r.amount>r.received_amount
   and c.whatsapp_consent and c.whatsapp_authorized_at is not null
   and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') ~ '^[0-9]{10,15}$'
  on conflict(dedupe_key) do nothing returning id
 )
 select count(*) into created_count from created;
 return created_count;
end $$;
revoke all on function public.prime_queue_contact_collections(text) from public;
grant execute on function public.prime_queue_contact_collections(text) to anon,authenticated;

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
   case when c.category='collection' then regexp_replace(cp.phone,'[^0-9]','','g') else p.phone_number end,
   'message',c.message)), '[]'::jsonb)
 into response from claimed c join public.whatsapp_pairings p on p.user_id=c.user_id
 left join public.counterparties cp on cp.id=c.contact_id;
 return response;
end $$;
revoke all on function public.prime_claim_outbox(text,int) from public;
grant execute on function public.prime_claim_outbox(text,int) to anon,authenticated;
notify pgrst,'reload schema';
