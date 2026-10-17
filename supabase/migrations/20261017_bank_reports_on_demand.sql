-- Read-only report for app AI, WhatsApp inbound, and explicit owner request.
-- Exact authentication/ownership checks live inside the security definer functions.
CREATE OR REPLACE FUNCTION public.prime_bank_report_for_owner(p_mode text DEFAULT 'imported_today'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if auth.uid() is null then raise exception 'Sessão obrigatória';end if;
 if p_mode not in ('imported_today','today','yesterday','last7') then raise exception 'Período inválido';end if;
 return public.prime_render_bank_report(auth.uid(),p_mode);
end $function$
;
revoke all on function public.prime_bank_report_for_owner(text) from public,anon;
grant execute on function public.prime_bank_report_for_owner(text) to authenticated;
CREATE OR REPLACE FUNCTION public.prime_bank_report_for_whatsapp_event(p_secret text, p_event_id uuid, p_mode text DEFAULT 'imported_today'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare recipient uuid; user_phone text;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_mode not in ('imported_today','today','yesterday','last7') then raise exception 'Período inválido';end if;
 select p.user_id,p.phone_number into recipient,user_phone
 from public.whatsapp_events e
 join public.whatsapp_pairings p on p.phone_number=regexp_replace(coalesce(e.from_number,''),'[^0-9]','','g')
 where e.id=p_event_id and e.status='processing' and e.message_type='text'
 and p.enabled and p.connected_at is not null
 limit 1;
 if recipient is null then raise exception 'WhatsApp não autorizado para este relatório';end if;
 return public.prime_render_bank_report(recipient,p_mode);
end $function$
;
revoke all on function public.prime_bank_report_for_whatsapp_event(text,uuid,text) from public,authenticated;
grant execute on function public.prime_bank_report_for_whatsapp_event(text,uuid,text) to anon;
CREATE OR REPLACE FUNCTION public.prime_queue_requested_bank_report(p_secret text, p_owner_id uuid, p_mode text DEFAULT 'imported_today'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 recipient record; message text; key text; queued uuid; present record;
begin
 if not public.whatsapp_bridge_authorized(p_secret) then raise exception 'unauthorized';end if;
 if p_mode not in ('imported_today','today','yesterday','last7') then raise exception 'Período inválido';end if;
 select p.user_id into recipient from public.whatsapp_pairings p
 where p.user_id=p_owner_id and p.enabled and p.connected_at is not null
 and p.phone_number ~ '^[0-9]{10,15}$';
 if not found then raise exception 'WhatsApp não está vinculado';end if;
 -- Prevent accidental double-clicking and excessive sends from a legitimate session.
 key:='bank-request:'||p_owner_id::text||':'||p_mode||':'||(floor(extract(epoch from now())/120))::bigint::text;
 select o.id,o.status into present from public.prime_outbox o
 where o.dedupe_key=key and o.user_id=p_owner_id;
 if found then return jsonb_build_object('queued',false,'id',present.id,'status',present.status);end if;
 message:=public.prime_render_bank_report(p_owner_id,p_mode);
 insert into public.prime_outbox(user_id,dedupe_key,category,reference,message)
 values(p_owner_id,key,'report',to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYYMMDD'),message)
 on conflict(dedupe_key) do nothing returning id into queued;
 if queued is null then
  select o.id,o.status into present from public.prime_outbox o where o.dedupe_key=key;
  return jsonb_build_object('queued',false,'id',present.id,'status',present.status);
 end if;
 return jsonb_build_object('queued',true,'id',queued,'status','pending');
end $function$
;
revoke all on function public.prime_queue_requested_bank_report(text,uuid,text) from public,authenticated;
grant execute on function public.prime_queue_requested_bank_report(text,uuid,text) to anon;
CREATE OR REPLACE FUNCTION public.prime_render_bank_report(p_owner uuid, p_mode text DEFAULT 'imported_today'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 local_today date := (now() at time zone 'America/Sao_Paulo')::date;
 label text; line text; report text;
 total int:=0; shown int:=0; posted int:=0; pending int:=0;
 credits numeric:=0; debits numeric:=0;
 movement record;
begin
 if p_mode not in ('imported_today','today','yesterday','last7') then raise exception 'Período inválido'; end if;
 if not exists(select 1 from public.workspaces w where w.owner_id=p_owner and w.kind in ('prime','personal'))
 then raise exception 'Proprietário não encontrado'; end if;
 label:=case p_mode
  when 'imported_today' then 'Importados hoje ('||to_char(local_today,'DD/MM/YYYY')||')'
  when 'today' then 'Data bancária de hoje ('||to_char(local_today,'DD/MM/YYYY')||')'
  when 'yesterday' then 'Data bancária de ontem ('||to_char(local_today-1,'DD/MM/YYYY')||')'
  else 'Data bancária dos últimos 7 dias' end;
 select count(*),count(*) filter(where t.provider_status='POSTED'),
 count(*) filter(where t.provider_status<>'POSTED'),
 coalesce(sum(t.amount) filter(where t.direction='credit' and t.provider_status='POSTED'),0),
 coalesce(sum(t.amount) filter(where t.direction='debit' and t.provider_status='POSTED'),0)
 into total,posted,pending,credits,debits
 from public.bank_transactions t
 join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=p_owner
 join public.bank_connections c on c.id=a.connection_id and c.owner_id=p_owner and c.archived_at is null
 join public.workspaces w on w.id=t.workspace_id and w.owner_id=p_owner and w.id=a.workspace_id
 where t.owner_id=p_owner and a.kind='BANK' and a.currency='BRL'
 and (case p_mode
  when 'imported_today' then (t.created_at at time zone 'America/Sao_Paulo')::date=local_today
  when 'today' then t.occurred_on=local_today
  when 'yesterday' then t.occurred_on=local_today-1
  else t.occurred_on between local_today-6 and local_today
 end);
 report:='PRIME FINANCE | RELATORIO BANCARIO'||E'\n'||label||
 E'\nMovimentos nos extratos já importados: '||total||
 ' ('||posted||' confirmados; '||pending||' pendentes)'||
 E'\nEntradas CONFIRMADAS: R$ '||to_char(credits,'FM999999990D00')||
 E'\nSaídas CONFIRMADAS: R$ '||to_char(debits,'FM999999990D00')||E'\n';
 if total=0 then
  return report||E'\nNenhum lançamento disponível no aplicativo para esse período.'||
   E'\nO banco pode disponibilizar novos dados posteriormente.'||
   E'\nConsulte: https://prime-finance-ochre.vercel.app/bancos';
 end if;
 report:=report||E'\n';
 for movement in
  select t.occurred_on,t.direction,t.amount,t.description,t.provider_status,
    a.display_name as account_name,w.kind as workspace_kind
  from public.bank_transactions t
  join public.bank_accounts a on a.id=t.bank_account_id and a.owner_id=p_owner
  join public.bank_connections c on c.id=a.connection_id and c.owner_id=p_owner and c.archived_at is null
  join public.workspaces w on w.id=t.workspace_id and w.owner_id=p_owner and w.id=a.workspace_id
  where t.owner_id=p_owner and a.kind='BANK' and a.currency='BRL'
  and (case p_mode
    when 'imported_today' then (t.created_at at time zone 'America/Sao_Paulo')::date=local_today
    when 'today' then t.occurred_on=local_today
    when 'yesterday' then t.occurred_on=local_today-1
    else t.occurred_on between local_today-6 and local_today
   end)
  order by t.occurred_on desc,t.created_at desc,t.id desc limit 18
 loop
  shown:=shown+1;
  line:=shown||'. '||to_char(movement.occurred_on,'DD/MM')||' '||
   case when movement.direction='credit' then 'ENTRADA ' else 'SAÍDA ' end||
   'R$ '||to_char(movement.amount,'FM999999990D00')||
   ' | '||left(regexp_replace(coalesce(movement.account_name,'Banco'),E'[\n\r]+',' ','g'),25)||
   case when movement.workspace_kind='personal' then ' (Pessoal)' else ' (Prime)' end||E'\n'||
   left(regexp_replace(coalesce(movement.description,''),E'[\n\r]+',' ','g'),72)||
   case when movement.provider_status<>'POSTED' then ' [PENDENTE NO BANCO]' else '' end||E'\n';
  report:=report||line;
 end loop;
 if total>shown then report:=report||E'\nMais '||(total-shown)||' lançamento(s) na área Bancos.';end if;
 report:=report||E'\n\nConferência: https://prime-finance-ochre.vercel.app/financeiro'||
 E'\nApenas leitura. Não realiza conciliação ou baixa.';
 return left(report,3900);
end $function$
;
revoke all on function public.prime_render_bank_report(uuid,text) from public,anon,authenticated;