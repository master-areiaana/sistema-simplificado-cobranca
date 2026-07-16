-- Aplicação atômica do plano de importação.
-- Esta migração não apaga registros nem reescreve campos manuais; ela apenas
-- completa os campos financeiros novos a partir dos equivalentes legados.
-- Se a chave única ainda não existir e houver duplicidades, a execução para
-- com erro antes de criar o índice para permitir auditoria manual.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.titles') is null then
    raise exception 'Tabela public.titles não existe. Execute primeiro o schema base.';
  end if;
end;
$$;

-- Compatibilidade aditiva com o schema já existente no projeto. As colunas
-- legadas (current_value, recebido_parcial, created_at...) são preservadas.
alter table public.titles
  add column if not exists client_group_key text,
  add column if not exists primary_client_code text,
  add column if not exists erp_client_codes text[],
  add column if not exists record_origin text default 'ERP',
  add column if not exists client_category text,
  add column if not exists received_value numeric default 0,
  add column if not exists open_value numeric default 0,
  add column if not exists erp_balance numeric default 0,
  add column if not exists partial_payment_detected boolean default false,
  add column if not exists action_to_do text,
  add column if not exists description text,
  add column if not exists workflow_status text default 'normal',
  add column if not exists loss_status boolean default false,
  add column if not exists loss_date date,
  add column if not exists loss_reason text;

alter table public.charge_events
  add column if not exists event_subtype text;

update public.titles
set
  received_value = coalesce(nullif(received_value, 0), recebido_parcial, 0),
  open_value = coalesce(nullif(open_value, 0), current_value, calculado, original_value, 0),
  erp_balance = coalesce(nullif(erp_balance, 0), current_value, calculado, original_value, 0),
  partial_payment_detected = coalesce(partial_payment_detected, false) or coalesce(recebido_parcial > 0, false),
  workflow_status = coalesce(nullif(workflow_status, ''), 'normal')
where received_value is null
   or open_value is null
   or open_value = 0
   or erp_balance is null
   or erp_balance = 0
   or workflow_status is null
   or workflow_status = '';

do $$
begin
  if to_regclass('public.titles_chave_oficial') is null then
    if exists (
      select 1
      from public.titles
      group by source, client_code, doc_type, title_number, seq, due_date
      having count(*) > 1
    ) then
      raise exception 'Existem duplicidades na chave oficial. Audite e aprove a correção antes de criar o índice.';
    end if;

    create unique index titles_chave_oficial
      on public.titles (source, client_code, doc_type, title_number, seq, due_date)
      nulls not distinct;
  end if;
end;
$$;

create or replace function public.apply_import_plan(
  p_import_source text,
  p_import_file text,
  p_creates jsonb default '[]'::jsonb,
  p_updates jsonb default '[]'::jsonb,
  p_absences jsonb default '[]'::jsonb,
  p_expected_counts jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source text;
  v_item jsonb;
  v_payload jsonb;
  v_id text;
  v_target_source text;
  v_created integer := 0;
  v_updated integer := 0;
  v_lowered integer := 0;
  v_expected_created integer := coalesce((p_expected_counts->>'created')::integer, jsonb_array_length(coalesce(p_creates, '[]'::jsonb)));
  v_expected_updated integer := coalesce((p_expected_counts->>'updated')::integer, jsonb_array_length(coalesce(p_updates, '[]'::jsonb)));
  v_expected_lowered integer := coalesce((p_expected_counts->>'lowered')::integer, jsonb_array_length(coalesce(p_absences, '[]'::jsonb)));
begin
  v_source := case upper(trim(coalesce(p_import_source, '')))
    when 'FINR1253' then 'FINR1253'
    when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
    when 'RPT_7007_CONS_CAR_EB' then 'RPT_7007_CONS_CAR_EB'
    else null
  end;

  if v_source is null then
    raise exception 'Origem de importação inválida: %', p_import_source;
  end if;

  if jsonb_typeof(coalesce(p_creates, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_updates, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_absences, '[]'::jsonb)) <> 'array' then
    raise exception 'Plano inválido: creates, updates e absences precisam ser arrays.';
  end if;

  if jsonb_array_length(coalesce(p_creates, '[]'::jsonb)) <> v_expected_created
    or jsonb_array_length(coalesce(p_updates, '[]'::jsonb)) <> v_expected_updated
    or jsonb_array_length(coalesce(p_absences, '[]'::jsonb)) <> v_expected_lowered then
    raise exception 'Contagens do plano não conferem com os itens recebidos.';
  end if;

  for v_payload in select value from jsonb_array_elements(coalesce(p_creates, '[]'::jsonb))
  loop
    if (case upper(trim(coalesce(v_payload->>'source', '')))
      when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
      else upper(trim(coalesce(v_payload->>'source', '')))
    end) <> v_source then
      raise exception 'Criação com origem diferente do relatório: %', v_payload->>'source';
    end if;

    insert into public.titles (
      id, source, client_code, client_name, doc_type, serie, title_number, seq,
      nf_servico, issue_date, due_date, original_value, received_value,
      open_value, erp_balance, recebido_parcial, calculado, current_value,
      portador, active, import_file,
      current_status, current_motive, current_contact_type, client_category,
      promise_date, last_contact_date, last_note, contact_count,
      protest_requested_by, workflow_status, updated_by
    ) values (
      coalesce(nullif(v_payload->>'id', ''), gen_random_uuid()::text),
      v_source,
      nullif(v_payload->>'client_code', ''),
      coalesce(v_payload->>'client_name', ''),
      nullif(v_payload->>'doc_type', ''),
      nullif(v_payload->>'serie', ''),
      coalesce(v_payload->>'title_number', ''),
      nullif(v_payload->>'seq', ''),
      nullif(v_payload->>'nf_servico', ''),
      nullif(v_payload->>'issue_date', ''),
      nullif(v_payload->>'due_date', ''),
      coalesce((v_payload->>'original_value')::numeric, 0),
      coalesce((v_payload->>'received_value')::numeric, 0),
      coalesce((v_payload->>'open_value')::numeric, 0),
      coalesce((v_payload->>'erp_balance')::numeric, 0),
      coalesce((v_payload->>'received_value')::numeric, 0),
      coalesce((v_payload->>'open_value')::numeric, 0),
      coalesce((v_payload->>'open_value')::numeric, 0),
      nullif(v_payload->>'portador', ''),
      coalesce((v_payload->>'active')::boolean, true),
      coalesce(nullif(v_payload->>'import_file', ''), p_import_file),
      coalesce(nullif(v_payload->>'current_status', ''), 'Não Contatado'),
      nullif(v_payload->>'current_motive', ''),
      nullif(v_payload->>'current_contact_type', ''),
      nullif(v_payload->>'client_category', ''),
      nullif(v_payload->>'promise_date', ''),
      nullif(v_payload->>'last_contact_date', ''),
      nullif(v_payload->>'last_note', ''),
      coalesce((v_payload->>'contact_count')::integer, 0),
      nullif(v_payload->>'protest_requested_by', ''),
      coalesce(nullif(v_payload->>'workflow_status', ''), 'normal'),
      'Importação Consolidada'
    )
    on conflict (source, client_code, doc_type, title_number, seq, due_date)
    do update set
      client_name = excluded.client_name,
      serie = excluded.serie,
      nf_servico = excluded.nf_servico,
      issue_date = excluded.issue_date,
      original_value = excluded.original_value,
      received_value = excluded.received_value,
      open_value = excluded.open_value,
      erp_balance = excluded.erp_balance,
      recebido_parcial = excluded.recebido_parcial,
      calculado = excluded.calculado,
      current_value = excluded.current_value,
      portador = excluded.portador,
      active = excluded.active,
      import_file = excluded.import_file,
      current_status = case when titles.workflow_status = 'baixado_importacao' then 'Não Contatado' else titles.current_status end,
      current_motive = case when titles.workflow_status = 'baixado_importacao' then null else titles.current_motive end,
      workflow_status = case when titles.workflow_status = 'baixado_importacao' then 'normal' else titles.workflow_status end,
      updated_by = 'Importação Consolidada';

    v_created := v_created + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    v_payload := coalesce(v_item->'payload', '{}'::jsonb);

    select source into v_target_source from public.titles where id = v_id for update;
    if not found then raise exception 'Título a atualizar não existe: %', v_id; end if;
    if (case upper(trim(coalesce(v_target_source, '')))
      when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
      else upper(trim(coalesce(v_target_source, '')))
    end) <> v_source then
      raise exception 'Atualização cruzada entre origens bloqueada para o título %', v_id;
    end if;

    update public.titles set
      client_code = case when v_payload ? 'client_code' then nullif(v_payload->>'client_code', '') else client_code end,
      client_name = case when v_payload ? 'client_name' then coalesce(v_payload->>'client_name', '') else client_name end,
      doc_type = case when v_payload ? 'doc_type' then nullif(v_payload->>'doc_type', '') else doc_type end,
      serie = case when v_payload ? 'serie' then nullif(v_payload->>'serie', '') else serie end,
      title_number = case when v_payload ? 'title_number' then coalesce(v_payload->>'title_number', '') else title_number end,
      seq = case when v_payload ? 'seq' then nullif(v_payload->>'seq', '') else seq end,
      nf_servico = case when v_payload ? 'nf_servico' then nullif(v_payload->>'nf_servico', '') else nf_servico end,
      issue_date = case when v_payload ? 'issue_date' then nullif(v_payload->>'issue_date', '') else issue_date end,
      due_date = case when v_payload ? 'due_date' then nullif(v_payload->>'due_date', '') else due_date end,
      original_value = case when v_payload ? 'original_value' then coalesce((v_payload->>'original_value')::numeric, 0) else original_value end,
      received_value = case when v_payload ? 'received_value' then coalesce((v_payload->>'received_value')::numeric, 0) else received_value end,
      open_value = case when v_payload ? 'open_value' then coalesce((v_payload->>'open_value')::numeric, 0) else open_value end,
      erp_balance = case when v_payload ? 'erp_balance' then coalesce((v_payload->>'erp_balance')::numeric, 0) else erp_balance end,
      recebido_parcial = case when v_payload ? 'received_value' then coalesce((v_payload->>'received_value')::numeric, 0) else recebido_parcial end,
      calculado = case when v_payload ? 'open_value' then coalesce((v_payload->>'open_value')::numeric, 0) else calculado end,
      current_value = case when v_payload ? 'open_value' then coalesce((v_payload->>'open_value')::numeric, 0) else current_value end,
      portador = case when v_payload ? 'portador' then nullif(v_payload->>'portador', '') else portador end,
      active = case when v_payload ? 'active' then coalesce((v_payload->>'active')::boolean, active) else active end,
      import_file = coalesce(nullif(v_payload->>'import_file', ''), p_import_file, import_file),
      current_status = case when v_payload ? 'current_status' then nullif(v_payload->>'current_status', '') else current_status end,
      current_motive = case when v_payload ? 'current_motive' then nullif(v_payload->>'current_motive', '') else current_motive end,
      workflow_status = case when v_payload ? 'workflow_status' then nullif(v_payload->>'workflow_status', '') else workflow_status end,
      updated_by = 'Importação Consolidada'
    where id = v_id;

    v_updated := v_updated + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_absences, '[]'::jsonb))
  loop
    v_id := v_item->>'id';
    select source into v_target_source from public.titles where id = v_id for update;
    if not found then raise exception 'Título ausente não existe: %', v_id; end if;
    if (case upper(trim(coalesce(v_target_source, '')))
      when 'RPT_7007' then 'RPT_7007_CONS_CAR_EB'
      else upper(trim(coalesce(v_target_source, '')))
    end) <> v_source then
      raise exception 'Baixa cruzada entre origens bloqueada para o título %', v_id;
    end if;

    update public.titles set
      active = false,
      current_status = 'Baixado',
      workflow_status = 'baixado_importacao',
      current_motive = 'Não consta na nova carteira importada',
      updated_by = 'Importação Consolidada'
    where id = v_id;

    insert into public.charge_events (
      title_id, client_code, client_name, event_type, event_subtype,
      event_date, status, motive, note, event_user
    )
    select
      id::text, client_code, client_name, 'IMPORTACAO', 'BAIXA_AUSENCIA',
      current_date::text, 'Baixado', 'Não consta na nova carteira importada',
      concat('Baixa automática segura do arquivo ', coalesce(p_import_file, 'sem nome')),
      'Importação Consolidada'
    from public.titles where id = v_id;

    v_lowered := v_lowered + 1;
  end loop;

  if v_created <> v_expected_created or v_updated <> v_expected_updated or v_lowered <> v_expected_lowered then
    raise exception 'Resultado divergente do plano: criados %, atualizados %, baixados %', v_created, v_updated, v_lowered;
  end if;

  insert into public.import_logs (
    file_name, source, total_read, inserted_count, updated_count, deactivated_count
  ) values (
    p_import_file, v_source, v_created + v_updated, v_created, v_updated, v_lowered
  );

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'lowered', v_lowered,
    'source', v_source,
    'atomic', true
  );
end;
$$;

grant execute on function public.apply_import_plan(text, text, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

commit;
